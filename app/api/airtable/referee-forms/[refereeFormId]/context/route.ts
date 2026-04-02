import Airtable from "airtable";
import { NextResponse } from "next/server";
import { verifyTokenFormat, checkTokenExpiry } from "@/app/lib/refereeToken";
import { findRefereeFormLocation } from "@/app/lib/airtable";

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
    const formatCheck = verifyTokenFormat(token);

    if (!formatCheck.ok) {
      return NextResponse.json({ error: formatCheck.reason }, { status: 403 });
    }

    const location = await findRefereeFormLocation(pat, refereeFormId);
    if (!location) {
      return NextResponse.json({ error: "Referee form was not found." }, { status: 404 });
    }

    const { base, tables, refereeForm } = location;

    const storedToken = extractField(refereeForm, ["Secure Token"]);
    if (!storedToken || storedToken !== token) {
      return NextResponse.json({ error: "Token mismatch." }, { status: 403 });
    }

    const expiryCheck = checkTokenExpiry(extractField(refereeForm, ["Token Expires At"]) || undefined);
    if (!expiryCheck.ok) {
      return NextResponse.json({ error: expiryCheck.reason }, { status: 403 });
    }

    const nominationId = ((refereeForm.get("Nomination") as string[] | undefined) || [])[0];
    const refereeId = ((refereeForm.get("Referee") as string[] | undefined) || [])[0];

    const nomination = nominationId ? await base(tables.nominations).find(nominationId) : null;
    const referee = refereeId ? await base(tables.referees).find(refereeId) : null;

    const awardId = nomination
      ? (((nomination.get("Award") as string[] | undefined) || [])[0] ?? "")
      : "";

    const award = awardId ? await base(tables.awards).find(awardId) : null;

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
