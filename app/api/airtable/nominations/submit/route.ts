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
import {
  AIRTABLE_SHARED_TABLES,
  createAirtableBase,
  getCityTableSet,
  normalizeCityName,
} from "@/app/lib/airtable";
import { getNominationRecordContacts } from "@/app/lib/nominationRecord";
import { createRefereeToken } from "@/app/lib/refereeToken";

const APP_BASE_URL =
  process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
  const resolvedCity = normalizeCityName(city);
  const awardCategory = payload.awardCategory?.trim() || "";

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

  if (!city || !awardCategory) {
    return NextResponse.json(
      { ok: false, error: "City and award category are required." },
      { status: 400 },
    );
  }

  if (!resolvedCity) {
    return NextResponse.json({ ok: false, error: "Unsupported city." }, { status: 400 });
  }

  if (!isAwardCategory(awardCategory)) {
    return NextResponse.json({ ok: false, error: "Unsupported award category." }, { status: 400 });
  }

  if (!nominatorFullName || !isValidPhone(nominatorPhone) || !isValidEmail(nominatorEmail) || !nominatorRelationship) {
    return NextResponse.json(
      { ok: false, error: "Valid nominator name, 10-digit phone, email, and relationship are required." },
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
        { ok: false, error: "Business name, owner/manager, 10-digit phone, and valid email are required." },
        { status: 400 },
      );
    }
  } else if (!nomineeFullName || !isValidPhone(nomineePhone) || !isValidEmail(nomineeEmail)) {
    return NextResponse.json(
      { ok: false, error: "Nominee full name, 10-digit phone, and valid email are required." },
      { status: 400 },
    );
  }

  if (!awardDefinition.isBusiness && !gender) {
    return NextResponse.json(
      { ok: false, error: "Gender is required." },
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
              "Parent/guardian name, 10-digit phone, email, and consent are required for Rising Star nominees under 18.",
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
        { ok: false, error: "All referee fields are required, including a valid email and 10-digit phone." },
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
    const cityTables = getCityTableSet(resolvedCity);
    if (!cityTables) {
      return NextResponse.json({ ok: false, error: "City Airtable tables are not configured." }, { status: 500 });
    }

    const base = createAirtableBase(pat);

    const cities = await base(AIRTABLE_SHARED_TABLES.cities).select({ view: "Grid view" }).all();
    const [awards, nominations] = await Promise.all([
      base(cityTables.awards).select({ view: "Grid view" }).all(),
      base(cityTables.nominations).select({ view: "Grid view" }).all(),
    ]);

    const cityRecord = cities.find(
      (record) => normalizeText(String(record.get("City Name") || "")) === normalizeText(resolvedCity),
    );
    if (!cityRecord) {
      return NextResponse.json({ ok: false, error: "Selected city was not found." }, { status: 400 });
    }

    const awardRecord = awards.find((record) => {
      const awardName = normalizeText(String(record.get("Award Name") || ""));
      const cityIds = (record.get("City") as string[] | undefined) || [];
      return (
        awardName === normalizeText(awardCategory) &&
        (cityIds.length === 0 || cityIds.includes(cityRecord.id))
      );
    });

    if (!awardRecord) {
      return NextResponse.json(
        { ok: false, error: "Selected award category was not found for the selected city." },
        { status: 400 },
      );
    }

    const nominationDeadline = safeDate(
      extractField(awardRecord, ["Referee Deadline", "Deadline"]),
    );

    if (!nominationDeadline) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Referee deadline is not configured for the selected award. Please contact the organizer.",
        },
        { status: 500 },
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

      const recordContacts = getNominationRecordContacts(record);

      if (awardDefinition.isBusiness) {
        return (
          normalizedBusinessName.length > 0 &&
          normalizedBusinessEmail.length > 0 &&
          normalizeText(recordContacts.businessName) === normalizedBusinessName &&
          normalizeText(recordContacts.businessEmail) === normalizedBusinessEmail
        );
      }

      const recordNomineeEmail = normalizeText(recordContacts.nomineeEmail);
      const recordNomineePhone = normalizePhone(recordContacts.nomineePhone);

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
      city: resolvedCity,
      awardCategory,
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
      refereeDeadline: nominationDeadline,
      submittedAt: new Date().toISOString(),
    };

    const displayName = awardDefinition.isBusiness ? businessName : nomineeFullName;

    const nominationCreate = await base(cityTables.nominations).create({
      "Nominee Name": displayName,
      City: [cityRecord.id],
      Award: [awardRecord.id],
      "Nomination Form Responses": JSON.stringify(nominationPayload, null, 2),
      "Nomination Answers JSON": JSON.stringify(awardResponses),
      "Nomination Answers Readable": awardResponses
        .map((r: { question: string; answer: string }) => `**${r.question}**\n${r.answer}`)
        .join("\n\n"),
      "Submission Date": new Date().toISOString().slice(0, 10),

      "Nominator Full Name": nominatorFullName,
      "Nominator Phone": nominatorPhone,
      "Nominator Email": nominatorEmail,
      "Relationship to Nominee": nominatorRelationship,
      "Nominee Phone": awardDefinition.isBusiness ? undefined : nomineePhone,
      "Nominee Email": awardDefinition.isBusiness ? undefined : nomineeEmail,
      "Business Phone": awardDefinition.isBusiness ? businessPhone : undefined,
      "Business Email": awardDefinition.isBusiness ? businessEmail : undefined,

      "All Referee Forms Completed": false,
      "Nomination Workflow Status": "Submitted",
      "Nomination Status": "Submitted",
    });

    const refereeCreates = await base(cityTables.referees).create(
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

    const refereeForms = await base(cityTables.refereeForms).create(
      refereeCreates.map((refereeRecord) => ({
        fields: {
          Name: `${String(refereeRecord.get("Full Name") || "Referee")} - Referee Statement`,
          Nomination: [nominationCreate.id],
          Referee: [refereeRecord.id],
          "Referee Email": String(refereeRecord.get("Email Address") || ""),
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
        const token = createRefereeToken();
        const link = new URL(
          `/referee/${refereeForm.id}?token=${encodeURIComponent(token)}`,
          APP_BASE_URL,
        ).toString();

        await base(cityTables.refereeForms).update(refereeForm.id, {
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
      city: resolvedCity,
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
