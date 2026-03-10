import Airtable from "airtable";
import { NextResponse } from "next/server";
import { AWARD_DEFINITIONS, isAwardCategory, normalizePhone } from "@/app/lib/awardConfig";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const NOMINATIONS_TABLE_ID = "tblYVo7XWq6BVo9LY";

type ValidationPayload = {
  awardCategory?: string;
  nomineeEmail?: string;
  nomineePhone?: string;
  businessName?: string;
  businessEmail?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

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

export async function POST(request: Request) {
  const pat = process.env.AIRTABLE_PAT;

  if (!pat) {
    return NextResponse.json({ ok: false, error: "Missing AIRTABLE_PAT in environment." }, { status: 500 });
  }

  let payload: ValidationPayload;

  try {
    payload = (await request.json()) as ValidationPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const awardCategory = payload.awardCategory?.trim() || "";

  if (!isAwardCategory(awardCategory)) {
    return NextResponse.json({ ok: false, error: "Award category is required." }, { status: 400 });
  }

  const isBusiness = AWARD_DEFINITIONS[awardCategory].isBusiness;
  const nomineeEmail = payload.nomineeEmail?.trim() || "";
  const nomineePhone = payload.nomineePhone?.trim() || "";
  const businessName = payload.businessName?.trim() || "";
  const businessEmail = payload.businessEmail?.trim() || "";

  if (isBusiness) {
    if (!businessName || !businessEmail) {
      return NextResponse.json(
        { ok: false, error: "Business name and business email are required for duplicate checks." },
        { status: 400 },
      );
    }
  } else if (!nomineeEmail && !nomineePhone) {
    return NextResponse.json(
      { ok: false, error: "Nominee email or phone is required for duplicate checks." },
      { status: 400 },
    );
  }

  try {
    const base = new Airtable({ apiKey: pat }).base(BASE_ID);
    const records = await base(NOMINATIONS_TABLE_ID).select({ view: "Grid view" }).all();

    const categoryKey = normalizeText(awardCategory);
    const duplicate = records.find((record) => {
      const workflowStatus = normalizeText(
        extractField(record, ["Nomination Workflow Status", "Nomination Status"]),
      );
      if (workflowStatus === "duplicate rejected" || workflowStatus === "disqualified") {
        return false;
      }

      const recordCategory = normalizeText(extractField(record, ["Award Name (Lookup)"]));
      if (!recordCategory.includes(categoryKey)) {
        return false;
      }

      if (isBusiness) {
        const recordBusinessName = normalizeText(extractField(record, ["Business Name"]));
        const recordBusinessEmail = normalizeText(extractField(record, ["Business Email"]));

        return (
          normalizeText(businessName) === recordBusinessName &&
          normalizeText(businessEmail) === recordBusinessEmail
        );
      }

      const recordNomineeEmail = normalizeText(
        extractField(record, ["Nominee Email", "Email", "Email Address"]),
      );
      const recordNomineePhone = normalizePhone(
        extractField(record, ["Nominee Phone", "Phone", "Phone Number"]),
      );

      const duplicateByEmail = nomineeEmail
        ? normalizeText(nomineeEmail) === recordNomineeEmail
        : false;
      const duplicateByPhone = nomineePhone
        ? normalizePhone(nomineePhone) === recordNomineePhone
        : false;

      return duplicateByEmail || duplicateByPhone;
    });

    if (duplicate) {
      return NextResponse.json(
        {
          ok: false,
          error: "This nominee has already been submitted for this category.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate nomination against Airtable.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
