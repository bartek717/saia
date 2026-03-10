import Airtable from "airtable";
import { NextResponse } from "next/server";
import { verifyRefereeToken } from "@/app/lib/refereeToken";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const TABLES = {
  awards: "tblEYOCQmY6XdhC86",
  nominations: "tblYVo7XWq6BVo9LY",
  referees: "tbl2SV7PuUpSNa7dL",
  refereeForms: "tbl7nZgFnv39FoOt7",
} as const;

function extractField(record: Airtable.Record<Airtable.FieldSet>, candidates: string[]) {
  for (const fieldName of candidates) {
    const value = record.get(fieldName);
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        return value.join("\n");
      }
      return String(value);
    }
  }
  return "";
}

function parseQuestions(raw: string, awardName: string) {
  if (!raw.trim()) {
    return [
      `How has the nominee demonstrated excellence in ${awardName}?`,
      "Share one specific example of impact you have observed.",
      "Why do you recommend this nominee for this award?",
    ];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      const cleaned = parsed.map((item) => item.trim()).filter((item) => item.length > 0);
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  } catch {
    // Continue to line parsing.
  }

  const fromLines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)-]\s*/, "").trim())
    .filter((line) => line.length > 0);

  if (fromLines.length > 0) {
    return fromLines;
  }

  return [
    `How has the nominee demonstrated excellence in ${awardName}?`,
    "Share one specific example of impact you have observed.",
    "Why do you recommend this nominee for this award?",
  ];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ refereeFormId: string }> },
) {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  try {
    const { refereeFormId } = await context.params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    const tokenCheck = verifyRefereeToken(token, refereeFormId);

    if (!tokenCheck.ok) {
      return NextResponse.json({ error: tokenCheck.reason }, { status: 403 });
    }

    const base = new Airtable({ apiKey: pat }).base(BASE_ID);
    const refereeForm = await base(TABLES.refereeForms).find(refereeFormId);

    const storedToken = extractField(refereeForm, ["Secure Token"]);
    if (storedToken && storedToken !== token) {
      return NextResponse.json({ error: "Token mismatch." }, { status: 403 });
    }

    const nominationId = ((refereeForm.get("Nomination") as string[] | undefined) || [])[0];
    const refereeId = ((refereeForm.get("Referee") as string[] | undefined) || [])[0];

    const nomination = nominationId ? await base(TABLES.nominations).find(nominationId) : null;
    const referee = refereeId ? await base(TABLES.referees).find(refereeId) : null;

    const awardId = nomination
      ? (((nomination.get("Award") as string[] | undefined) || [])[0] ?? "")
      : "";

    const award = awardId ? await base(TABLES.awards).find(awardId) : null;

    const awardName = award
      ? extractField(award, ["Award Name", "Name", "Title"]) || "Award"
      : "Award";

    const rawQuestions = award
      ? extractField(award, [
          "Referee Questions JSON",
          "Questions",
          "Question(s)",
          "Referee Questions",
          "Questionnaire",
          "Referral Questions",
        ])
      : "";

    const nomineeName = nomination
      ? extractField(nomination, ["Nominee Name", "Name", "Nominee"])
      : "";

    const refereeName =
      (referee ? extractField(referee, ["Full Name", "Name"]) : "") ||
      extractField(refereeForm, ["Name"]);

    const submissionStatus = extractField(refereeForm, ["Submission Status"]) || "Not Started";
    const submittedAt = extractField(refereeForm, ["Date Submitted"]);
    const isSubmitted = submissionStatus.toLowerCase() === "submitted";

    return NextResponse.json({
      refereeFormId,
      nomineeName,
      refereeName,
      awardName,
      questions: parseQuestions(rawQuestions, awardName),
      submissionStatus,
      submittedAt,
      isSubmitted,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load referee form context from Airtable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
