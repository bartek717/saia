import Airtable from "airtable";
import { NextResponse } from "next/server";
import { verifyRefereeToken } from "@/app/lib/refereeToken";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const TABLES = {
  nominations: "tblYVo7XWq6BVo9LY",
  refereeForms: "tbl7nZgFnv39FoOt7",
} as const;

type SubmitPayload = {
  nomineeName?: string;
  refereeName?: string;
  awardName?: string;
  token?: string;
  answers?: Array<{ question: string; answer: string }>;
};

function extractField(record: Airtable.Record<Airtable.FieldSet>, candidates: string[]) {
  for (const fieldName of candidates) {
    const value = record.get(fieldName);
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      return String(value);
    }
  }
  return "";
}

async function callWebhook(url: string | undefined, payload: unknown) {
  if (!url) {
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best effort.
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ refereeFormId: string }> },
) {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ ok: false, error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  let payload: SubmitPayload;

  try {
    payload = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const nomineeName = payload.nomineeName?.trim() || "";
  const refereeName = payload.refereeName?.trim() || "";
  const awardName = payload.awardName?.trim() || "Award";
  const token = payload.token?.trim() || "";
  const answers = payload.answers || [];

  if (!nomineeName || !refereeName || answers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nominee, referee, and all question responses are required." },
      { status: 400 },
    );
  }

  const hasEmptyAnswer = answers.some(
    (entry) => !entry.question?.trim() || !entry.answer?.trim(),
  );

  if (hasEmptyAnswer) {
    return NextResponse.json(
      { ok: false, error: "All award-specific questions must be answered." },
      { status: 400 },
    );
  }

  const formStatement = [
    `Referee: ${refereeName}`,
    `Nominee: ${nomineeName}`,
    `Award: ${awardName}`,
    "",
    ...answers.map((entry, index) => `Q${index + 1}. ${entry.question}\nA${index + 1}. ${entry.answer}`),
  ].join("\n\n");

  try {
    const { refereeFormId } = await context.params;

    const tokenCheck = verifyRefereeToken(token, refereeFormId);
    if (!tokenCheck.ok) {
      return NextResponse.json({ ok: false, error: tokenCheck.reason }, { status: 403 });
    }

    const base = new Airtable({ apiKey: pat }).base(BASE_ID);
    const existingRecord = await base(TABLES.refereeForms).find(refereeFormId);

    const existingToken = extractField(existingRecord, ["Secure Token"]);
    if (existingToken && existingToken !== token) {
      return NextResponse.json({ ok: false, error: "Token mismatch." }, { status: 403 });
    }

    const existingStatus = String(existingRecord.get("Submission Status") || "").toLowerCase();

    if (existingStatus === "submitted") {
      return NextResponse.json(
        { ok: false, error: "This referee form has already been submitted and is now locked." },
        { status: 409 },
      );
    }

    await base(TABLES.refereeForms).update(refereeFormId, {
      "Form Statement": formStatement,
      "Submission Status": "Submitted",
      "Date Submitted": new Date().toISOString().slice(0, 10),
      Name: `${refereeName} - ${nomineeName}`,
    });

    const nominationId = ((existingRecord.get("Nomination") as string[] | undefined) || [])[0];

    if (nominationId) {
      const nominationRecord = await base(TABLES.nominations).find(nominationId);
      const refereeFormIds = (nominationRecord.get("Referee Forms") as string[] | undefined) || [];

      const linkedForms = await Promise.all(
        refereeFormIds.map((id) => base(TABLES.refereeForms).find(id)),
      );

      const submittedCount = linkedForms.filter((record) => {
        const status = String(record.get("Submission Status") || "").toLowerCase();
        return status === "submitted";
      }).length;

      const workflowStatus =
        submittedCount >= 2 ? "Fully Complete" : submittedCount === 1 ? "Referee 1 Complete" : "Submitted";

      await base(TABLES.nominations).update(nominationId, {
        "Nomination Workflow Status": workflowStatus,
        "Nomination Status": submittedCount >= 2 ? "Completed" : "Submitted",
      });

      if (submittedCount >= 2) {
        await callWebhook(process.env.COMPLETION_EMAIL_WEBHOOK_URL, {
          type: "nomination_fully_complete",
          nominationId,
          nominatorEmail: extractField(nominationRecord, ["Nominator Email"]),
          nomineeEmail:
            extractField(nominationRecord, ["Nominee Email"]) ||
            extractField(nominationRecord, ["Business Email"]),
          nomineeName: extractField(nominationRecord, ["Nominee Name"]),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit referee form to Airtable.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
