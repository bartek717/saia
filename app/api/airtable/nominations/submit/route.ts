import Airtable from "airtable";
import { NextResponse } from "next/server";
import {
  AWARD_DEFINITIONS,
  isAwardCategory,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  getAgeOnDate,
} from "@/app/lib/awardConfig";
import { createRefereeToken } from "@/app/lib/refereeToken";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appRaso1tDQvVu3Ry";
const APP_BASE_URL =
  process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TABLES = {
  awards: "tblEYOCQmY6XdhC86",
  nominations: "tblYVo7XWq6BVo9LY",
  referees: "tbl2SV7PuUpSNa7dL",
  refereeForms: "tbl7nZgFnv39FoOt7",
  cities: "tbl8lzty1gF6b9ox7",
} as const;

type RefereeInput = {
  name?: string;
  email?: string;
  phone?: string;
  relation?: string;
  relationOther?: string;
};

type AwardResponse = {
  questionId?: string;
  question?: string;
  answer?: string;
};

type SubmitPayload = {
  city?: string;
  awardCategory?: string;
  nominationDeadline?: string;
  eligibilityConfirmed?: string;
  nomineeConsentConfirmed?: string;

  nominatorFullName?: string;
  nominatorPhone?: string;
  nominatorEmail?: string;
  nominatorRelationship?: string;
  nominatorRelationshipOther?: string;

  nomineeFullName?: string;
  nomineePhone?: string;
  nomineeEmail?: string;
  gender?: string;
  cvUrl?: string;

  businessName?: string;
  ownerManagerName?: string;
  businessPhone?: string;
  businessEmail?: string;
  websiteLink?: string;
  socialMediaLinks?: string;

  dateOfBirth?: string;
  parentGuardianName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentConsentConfirmed?: boolean;

  awardResponses?: AwardResponse[];
  referees?: RefereeInput[];
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

function safeDate(value: string | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
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
    // Best effort; workflow should continue even when webhook fails.
  }
}

function countRequiredAwardAnswers(
  category: string,
  awardResponses: Array<{ questionId: string; question: string; answer: string }>,
) {
  const answerMap = Object.fromEntries(
    awardResponses.map((entry) => [entry.questionId, entry.answer]),
  ) as Record<string, string>;

  if (!isAwardCategory(category)) {
    return { missing: ["Award category is invalid."], answerMap };
  }

  const missing: string[] = [];
  for (const question of AWARD_DEFINITIONS[category].nominationQuestions) {
    const dependencyMet =
      !question.dependsOn ||
      (answerMap[question.dependsOn.id] || "") === question.dependsOn.value;
    if (!dependencyMet || !question.required) {
      continue;
    }

    const answer = (answerMap[question.id] || "").trim();
    if (!answer) {
      missing.push(question.label);
    }
  }

  return { missing, answerMap };
}

export async function POST(request: Request) {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) {
    return NextResponse.json(
      { ok: false, error: "Missing AIRTABLE_PAT in environment." },
      { status: 500 },
    );
  }

  let payload: SubmitPayload;
  try {
    payload = (await request.json()) as SubmitPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const city = payload.city?.trim() || "";
  const awardCategory = payload.awardCategory?.trim() || "";
  const nominationDeadline = payload.nominationDeadline?.trim() || "";
  const eligibilityConfirmed = payload.eligibilityConfirmed?.trim() || "";
  const nomineeConsentConfirmed = payload.nomineeConsentConfirmed?.trim() || "";

  const nominatorFullName = payload.nominatorFullName?.trim() || "";
  const nominatorPhone = payload.nominatorPhone?.trim() || "";
  const nominatorEmail = payload.nominatorEmail?.trim() || "";
  const nominatorRelationship = payload.nominatorRelationship?.trim() || "";
  const nominatorRelationshipOther = payload.nominatorRelationshipOther?.trim() || "";

  const nomineeFullName = payload.nomineeFullName?.trim() || "";
  const nomineePhone = payload.nomineePhone?.trim() || "";
  const nomineeEmail = payload.nomineeEmail?.trim() || "";
  const gender = payload.gender?.trim() || "";
  const cvUrl = payload.cvUrl?.trim() || "";

  const businessName = payload.businessName?.trim() || "";
  const ownerManagerName = payload.ownerManagerName?.trim() || "";
  const businessPhone = payload.businessPhone?.trim() || "";
  const businessEmail = payload.businessEmail?.trim() || "";
  const websiteLink = payload.websiteLink?.trim() || "";
  const socialMediaLinks = payload.socialMediaLinks?.trim() || "";

  const dateOfBirth = payload.dateOfBirth?.trim() || "";
  const parentGuardianName = payload.parentGuardianName?.trim() || "";
  const parentPhone = payload.parentPhone?.trim() || "";
  const parentEmail = payload.parentEmail?.trim() || "";
  const parentConsentConfirmed = Boolean(payload.parentConsentConfirmed);

  const referees = payload.referees || [];
  const awardResponsesRaw = payload.awardResponses || [];
  const awardResponses = awardResponsesRaw.map((entry) => ({
    questionId: entry.questionId?.trim() || "",
    question: entry.question?.trim() || "",
    answer: entry.answer?.trim() || "",
  }));

  if (!city || !awardCategory || !nominationDeadline) {
    return NextResponse.json(
      { ok: false, error: "City, award category, and referee deadline are required." },
      { status: 400 },
    );
  }

  if (!isAwardCategory(awardCategory)) {
    return NextResponse.json({ ok: false, error: "Unsupported award category." }, { status: 400 });
  }

  if (eligibilityConfirmed !== "Yes") {
    return NextResponse.json(
      { ok: false, error: "Eligibility must be confirmed as Yes to proceed." },
      { status: 400 },
    );
  }

  if (nomineeConsentConfirmed !== "Yes") {
    return NextResponse.json(
      { ok: false, error: "Nominee consent must be confirmed as Yes to proceed." },
      { status: 400 },
    );
  }

  if (!nominatorFullName || !isValidPhone(nominatorPhone) || !isValidEmail(nominatorEmail) || !nominatorRelationship) {
    return NextResponse.json(
      { ok: false, error: "Valid nominator name, phone, email, and relationship are required." },
      { status: 400 },
    );
  }

  if (nominatorRelationship === "Other" && !nominatorRelationshipOther) {
    return NextResponse.json(
      { ok: false, error: "Nominator relationship details are required when 'Other' is selected." },
      { status: 400 },
    );
  }

  const awardDefinition = AWARD_DEFINITIONS[awardCategory];

  if (awardDefinition.isBusiness) {
    if (!businessName || !ownerManagerName || !isValidPhone(businessPhone) || !isValidEmail(businessEmail)) {
      return NextResponse.json(
        { ok: false, error: "Business name, owner/manager, valid phone, and valid email are required." },
        { status: 400 },
      );
    }
  } else if (!nomineeFullName || !isValidPhone(nomineePhone) || !isValidEmail(nomineeEmail)) {
    return NextResponse.json(
      { ok: false, error: "Nominee full name, valid phone, and valid email are required." },
      { status: 400 },
    );
  }

  if (awardDefinition.cvRequirement === "Required" && !cvUrl) {
    return NextResponse.json(
      { ok: false, error: "CV URL is required for this category." },
      { status: 400 },
    );
  }

  const { missing: missingAwardAnswers, answerMap } = countRequiredAwardAnswers(
    awardCategory,
    awardResponses,
  );

  if (missingAwardAnswers.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Required award-specific responses are missing: ${missingAwardAnswers.join("; ")}`,
      },
      { status: 400 },
    );
  }

  if (awardCategory === "Still Going Strong" && answerMap.stillGoingStrongAgeConfirmed !== "Yes") {
    return NextResponse.json(
      { ok: false, error: "Still Going Strong nominees must be 65+ this calendar year." },
      { status: 400 },
    );
  }

  if (awardCategory === "Rising Star") {
    if (answerMap.risingStarAgeConfirmed !== "Yes") {
      return NextResponse.json(
        { ok: false, error: "Rising Star nominees must be between 14 and 19 this calendar year." },
        { status: 400 },
      );
    }

    if (!dateOfBirth) {
      return NextResponse.json(
        { ok: false, error: "Date of birth is required for Rising Star." },
        { status: 400 },
      );
    }

    const yearEnd = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31));
    const ageAtYearEnd = getAgeOnDate(dateOfBirth, yearEnd);
    if (ageAtYearEnd < 14 || ageAtYearEnd > 19) {
      return NextResponse.json(
        { ok: false, error: "Rising Star nominees must be between 14 and 19 this calendar year." },
        { status: 400 },
      );
    }

    const ageNow = getAgeOnDate(dateOfBirth, new Date());
    if (ageNow >= 0 && ageNow < 18) {
      if (!parentGuardianName || !isValidPhone(parentPhone) || !isValidEmail(parentEmail) || !parentConsentConfirmed) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Parent/guardian name, phone, email, and consent are required for Rising Star nominees under 18.",
          },
          { status: 400 },
        );
      }
    }
  }

  if (referees.length !== 2) {
    return NextResponse.json({ ok: false, error: "Exactly two referees are required." }, { status: 400 });
  }

  for (const referee of referees) {
    const name = referee.name?.trim() || "";
    const email = referee.email?.trim() || "";
    const phone = referee.phone?.trim() || "";
    const relation = referee.relation?.trim() || "";

    if (!name || !isValidEmail(email) || !isValidPhone(phone) || !relation) {
      return NextResponse.json(
        { ok: false, error: "All referee fields are required with valid email/phone." },
        { status: 400 },
      );
    }

    if (relation.toLowerCase() === "family") {
      return NextResponse.json(
        { ok: false, error: "Immediate family members are not eligible referees." },
        { status: 400 },
      );
    }

    if (relation === "Other" && !(referee.relationOther?.trim() || "")) {
      return NextResponse.json(
        { ok: false, error: "Referee relation details are required when 'Other' is selected." },
        { status: 400 },
      );
    }
  }

  try {
    const base = new Airtable({ apiKey: pat }).base(BASE_ID);

    const [cities, awards, nominations] = await Promise.all([
      base(TABLES.cities).select({ view: "Grid view" }).all(),
      base(TABLES.awards).select({ view: "Grid view" }).all(),
      base(TABLES.nominations).select({ view: "Grid view" }).all(),
    ]);

    const cityRecord = cities.find(
      (record) => normalizeText(String(record.get("City Name") || "")) === normalizeText(city),
    );
    if (!cityRecord) {
      return NextResponse.json({ ok: false, error: "Selected city was not found." }, { status: 400 });
    }

    const awardRecord = awards.find((record) => {
      const awardName = normalizeText(String(record.get("Award Name") || ""));
      const cityIds = (record.get("City") as string[] | undefined) || [];
      return awardName === normalizeText(awardCategory) && (cityIds.length === 0 || cityIds.includes(cityRecord.id));
    });

    if (!awardRecord) {
      return NextResponse.json(
        { ok: false, error: "Selected award category was not found for the selected city." },
        { status: 400 },
      );
    }

    const categoryKey = normalizeText(awardCategory);
    const normalizedNomineeEmail = normalizeText(nomineeEmail);
    const normalizedNomineePhone = normalizePhone(nomineePhone);
    const normalizedBusinessName = normalizeText(businessName);
    const normalizedBusinessEmail = normalizeText(businessEmail);

    const duplicate = nominations.find((record) => {
      const workflowStatus = normalizeText(
        extractField(record, ["Nomination Workflow Status", "Nomination Status"]),
      );
      if (workflowStatus === "duplicate rejected" || workflowStatus === "disqualified") {
        return false;
      }

      const recordAwardIds = (record.get("Award") as string[] | undefined) || [];
      const recordAwardLookup = normalizeText(extractField(record, ["Award Name (Lookup)"]));
      const sameCategory = recordAwardIds.includes(awardRecord.id) || recordAwardLookup.includes(categoryKey);
      if (!sameCategory) {
        return false;
      }

      if (awardDefinition.isBusiness) {
        const recordBusinessName = normalizeText(extractField(record, ["Business Name"]));
        const recordBusinessEmail = normalizeText(extractField(record, ["Business Email"]));
        return (
          normalizedBusinessName.length > 0 &&
          normalizedBusinessEmail.length > 0 &&
          recordBusinessName === normalizedBusinessName &&
          recordBusinessEmail === normalizedBusinessEmail
        );
      }

      const recordNomineeEmail = normalizeText(
        extractField(record, ["Nominee Email", "Email", "Email Address"]),
      );
      const recordNomineePhone = normalizePhone(
        extractField(record, ["Nominee Phone", "Phone", "Phone Number"]),
      );

      const duplicateByEmail =
        normalizedNomineeEmail.length > 0 &&
        recordNomineeEmail.length > 0 &&
        recordNomineeEmail === normalizedNomineeEmail;
      const duplicateByPhone =
        normalizedNomineePhone.length > 0 &&
        recordNomineePhone.length > 0 &&
        recordNomineePhone === normalizedNomineePhone;

      return duplicateByEmail || duplicateByPhone;
    });

    if (duplicate) {
      return NextResponse.json(
        { ok: false, error: "This nominee has already been submitted for this category." },
        { status: 409 },
      );
    }

    const nominationPayload = {
      city,
      awardCategory,
      eligibilityConfirmed,
      nomineeConsentConfirmed,
      nominator: {
        fullName: nominatorFullName,
        phone: nominatorPhone,
        email: nominatorEmail,
        relationship: nominatorRelationship,
        relationshipOther: nominatorRelationshipOther,
      },
      nominee: {
        fullName: nomineeFullName,
        phone: nomineePhone,
        email: nomineeEmail,
        gender,
        dateOfBirth,
      },
      business: {
        name: businessName,
        ownerManagerName,
        phone: businessPhone,
        email: businessEmail,
        websiteLink,
        socialMediaLinks,
      },
      cvUrl,
      parentGuardian: {
        name: parentGuardianName,
        phone: parentPhone,
        email: parentEmail,
        consentConfirmed: parentConsentConfirmed,
      },
      awardResponses,
      submittedAt: new Date().toISOString(),
    };

    const displayName = awardDefinition.isBusiness ? businessName : nomineeFullName;

    const nominationCreate = await base(TABLES.nominations).create({
      "Nominee Name": displayName,
      City: [cityRecord.id],
      Award: [awardRecord.id],
      "Nomination Form Responses": JSON.stringify(nominationPayload, null, 2),
      "Nomination Answers JSON": JSON.stringify(awardResponses),
      "Submission Date": new Date().toISOString().slice(0, 10),

      "Eligibility Confirmed": eligibilityConfirmed,
      "Nominee Consent Confirmed": nomineeConsentConfirmed,

      "Nominator Full Name": nominatorFullName,
      "Nominator Phone": nominatorPhone,
      "Nominator Email": nominatorEmail,
      "Relationship to Nominee": nominatorRelationship,

      "Nominee Email": nomineeEmail || undefined,
      "Nominee Phone": nomineePhone || undefined,
      Gender: gender || undefined,
      "CV URL": cvUrl || undefined,

      "Is Business Nomination": awardDefinition.isBusiness,
      "Business Name": businessName || undefined,
      "Owner / Manager Name": ownerManagerName || undefined,
      "Business Phone": businessPhone || undefined,
      "Business Email": businessEmail || undefined,
      "Website Link": websiteLink || undefined,
      "Social Media Links": socialMediaLinks || undefined,

      "Still Going Strong 65+ Confirmed":
        awardCategory === "Still Going Strong" ? answerMap.stillGoingStrongAgeConfirmed || "No" : undefined,
      "Rising Star 14-19 Confirmed":
        awardCategory === "Rising Star" ? answerMap.risingStarAgeConfirmed || "No" : undefined,
      "Date of Birth": safeDate(dateOfBirth) || undefined,
      "Parent/Guardian Name": parentGuardianName || undefined,
      "Parent Phone": parentPhone || undefined,
      "Parent Email": parentEmail || undefined,
      "Parent Consent Confirmed": parentConsentConfirmed,

      "Individual Duplicate Key (Email)":
        !awardDefinition.isBusiness && nomineeEmail
          ? `${normalizeText(nomineeEmail)}|${categoryKey}`
          : undefined,
      "Individual Duplicate Key (Phone)":
        !awardDefinition.isBusiness && nomineePhone
          ? `${normalizePhone(nomineePhone)}|${categoryKey}`
          : undefined,
      "Business Duplicate Key":
        awardDefinition.isBusiness && businessName && businessEmail
          ? `${normalizeText(businessName)}|${normalizeText(businessEmail)}|${categoryKey}`
          : undefined,

      "Nomination Workflow Status": "Submitted",
      "Nomination Status": "Submitted",
    });

    const refereeCreates = await base(TABLES.referees).create(
      referees.map((referee) => ({
        fields: {
          "Full Name": referee.name?.trim() || "",
          "Email Address": referee.email?.trim() || "",
          "Phone Number": referee.phone?.trim() || "",
          "Affiliation or Organization":
            referee.relation === "Other"
              ? `Relation: Other (${referee.relationOther?.trim() || ""})`
              : `Relation: ${referee.relation?.trim() || ""}`,
          "Relationship to Nominee": referee.relation?.trim() || undefined,
          Nomination: [nominationCreate.id],
        },
      })),
    );

    const refereeForms = await base(TABLES.refereeForms).create(
      refereeCreates.map((refereeRecord) => ({
        fields: {
          Name: `${String(refereeRecord.get("Full Name") || "Referee")} - Referee Statement`,
          Nomination: [nominationCreate.id],
          Referee: [refereeRecord.id],
          "Submission Status": "Not Started",
          Deadline: nominationDeadline,
        },
      })),
    );

    const updatedForms = await Promise.all(
      refereeForms.map(async (refereeForm) => {
        const deadlineDate = safeDate(nominationDeadline);
        const expiryIso = deadlineDate
          ? new Date(`${deadlineDate}T23:59:59.000Z`).toISOString()
          : undefined;
        const token = createRefereeToken(refereeForm.id, expiryIso);
        const link = `${APP_BASE_URL}/referee/${refereeForm.id}?token=${encodeURIComponent(token)}`;

        await base(TABLES.refereeForms).update(refereeForm.id, {
          Link: link,
          "User Link": link,
          "Secure Token": token,
          "Token Expires At": expiryIso || undefined,
        });

        return {
          id: refereeForm.id,
          link,
          refereeEmail: String(
            refereeCreates.find((r) => r.id === (refereeForm.get("Referee") as string[] | undefined)?.[0])?.get(
              "Email Address",
            ) || "",
          ),
        };
      }),
    );

    await callWebhook(process.env.REFEREE_EMAIL_WEBHOOK_URL, {
      type: "referee_invites_ready",
      nominationId: nominationCreate.id,
      city,
      awardCategory,
      nominatorEmail,
      nomineeEmail: awardDefinition.isBusiness ? businessEmail : nomineeEmail,
      refereeForms: updatedForms,
    });

    return NextResponse.json({
      ok: true,
      nominationId: nominationCreate.id,
      refereeIds: refereeCreates.map((record) => record.id),
      refereeFormIds: refereeForms.map((record) => record.id),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit nomination to Airtable.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
