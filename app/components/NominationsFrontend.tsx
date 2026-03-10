"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AWARD_CATEGORIES,
  AWARD_DEFINITIONS,
  NOMINATOR_RELATIONSHIP_OPTIONS,
  REFEREE_RELATIONSHIP_OPTIONS,
  SUPPORTED_CITIES,
  getAgeOnDate,
  isAwardCategory,
  isValidEmail,
  isValidPhone,
} from "../lib/awardConfig";

type RefereeContact = {
  name: string;
  email: string;
  phone: string;
  relation: string;
  relationOther: string;
};

type NominationFormState = {
  city: string;
  awardCategory: string;
  nominationDeadline: string;
  eligibilityConfirmed: string;
  nomineeConsentConfirmed: string;

  nominatorFullName: string;
  nominatorPhone: string;
  nominatorEmail: string;
  nominatorRelationship: string;
  nominatorRelationshipOther: string;

  nomineeFullName: string;
  nomineePhone: string;
  nomineeEmail: string;
  gender: string;
  cvUrl: string;

  businessName: string;
  ownerManagerName: string;
  businessPhone: string;
  businessEmail: string;
  websiteLink: string;
  socialMediaLinks: string;

  dateOfBirth: string;
  parentGuardianName: string;
  parentPhone: string;
  parentEmail: string;
  parentConsentConfirmed: boolean;

  awardAnswers: Record<string, string>;
};

type AwardOption = {
  id: string;
  name: string;
  cityIds: string[];
  active: boolean;
};

type AirtableBootstrap = {
  cities: Array<{ id: string; name: string }>;
  awards: AwardOption[];
};

const emptyReferee: RefereeContact = {
  name: "",
  email: "",
  phone: "",
  relation: "",
  relationOther: "",
};

const today = new Date().toISOString().slice(0, 10);
const defaultDeadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  .toISOString()
  .slice(0, 10);

const initialForm: NominationFormState = {
  city: "",
  awardCategory: "",
  nominationDeadline: defaultDeadline,
  eligibilityConfirmed: "",
  nomineeConsentConfirmed: "",

  nominatorFullName: "",
  nominatorPhone: "",
  nominatorEmail: "",
  nominatorRelationship: "",
  nominatorRelationshipOther: "",

  nomineeFullName: "",
  nomineePhone: "",
  nomineeEmail: "",
  gender: "",
  cvUrl: "",

  businessName: "",
  ownerManagerName: "",
  businessPhone: "",
  businessEmail: "",
  websiteLink: "",
  socialMediaLinks: "",

  dateOfBirth: "",
  parentGuardianName: "",
  parentPhone: "",
  parentEmail: "",
  parentConsentConfirmed: false,

  awardAnswers: {},
};

function answerFor(
  form: NominationFormState,
  questionId: string,
): string {
  return form.awardAnswers[questionId] || "";
}

export default function NominationsFrontend() {
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");

  const [cityOptions, setCityOptions] = useState<Array<{ id: string; name: string }>>(
    SUPPORTED_CITIES.map((city) => ({ id: city.toLowerCase(), name: city })),
  );

  const [awardOptions, setAwardOptions] = useState<AwardOption[]>(
    AWARD_CATEGORIES.map((name) => ({
      id: name,
      name,
      cityIds: [],
      active: true,
    })),
  );

  const [form, setForm] = useState<NominationFormState>(initialForm);
  const [referees, setReferees] = useState<RefereeContact[]>([
    { ...emptyReferee },
    { ...emptyReferee },
  ]);

  const [nominationError, setNominationError] = useState("");
  const [finalSubmitting, setFinalSubmitting] = useState(false);
  const [finalSubmitted, setFinalSubmitted] = useState(false);

  const cityIdByName = useMemo(
    () => Object.fromEntries(cityOptions.map((city) => [city.name, city.id])),
    [cityOptions],
  );

  const filteredAwards = useMemo(() => {
    const selectedCityId = cityIdByName[form.city] || "";
    return awardOptions
      .filter((award) => award.active)
      .filter((award) => {
        if (!selectedCityId || award.cityIds.length === 0) {
          return true;
        }
        return award.cityIds.includes(selectedCityId);
      })
      .filter((award) => AWARD_CATEGORIES.includes(award.name as (typeof AWARD_CATEGORIES)[number]));
  }, [awardOptions, cityIdByName, form.city]);

  const awardDefinition = useMemo(() => {
    if (!isAwardCategory(form.awardCategory)) {
      return null;
    }
    return AWARD_DEFINITIONS[form.awardCategory];
  }, [form.awardCategory]);

  const visibleAwardQuestions = useMemo(() => {
    if (!awardDefinition) {
      return [];
    }
    return awardDefinition.nominationQuestions.filter((question) => {
      if (!question.dependsOn) {
        return true;
      }
      return answerFor(form, question.dependsOn.id) === question.dependsOn.value;
    });
  }, [awardDefinition, form]);

  const isRisingStar = form.awardCategory === "Rising Star";
  const needsParentBlock = useMemo(() => {
    if (!isRisingStar || !form.dateOfBirth) {
      return false;
    }
    const age = getAgeOnDate(form.dateOfBirth, new Date());
    return age >= 0 && age < 18;
  }, [isRisingStar, form.dateOfBirth]);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        setBootstrapLoading(true);
        const response = await fetch("/api/airtable/bootstrap", { cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.error || "Failed to load Airtable data.");
        }

        const payload = (await response.json()) as AirtableBootstrap;

        if (payload.cities.length > 0) {
          setCityOptions(
            payload.cities.filter((city) => SUPPORTED_CITIES.includes(city.name as (typeof SUPPORTED_CITIES)[number])),
          );
        }

        if (payload.awards.length > 0) {
          setAwardOptions(payload.awards.filter((award) => award.name.trim().length > 0));
        }

        setBootstrapError("");
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : "Failed to load Airtable data.");
      } finally {
        setBootstrapLoading(false);
      }
    }

    loadBootstrap();
  }, []);

  function updateField<K extends keyof NominationFormState>(key: K, value: NominationFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateClientSide() {
    if (!form.city || !SUPPORTED_CITIES.includes(form.city as (typeof SUPPORTED_CITIES)[number])) {
      return "City is required.";
    }

    if (!isAwardCategory(form.awardCategory)) {
      return "Award category is required.";
    }

    if (form.eligibilityConfirmed !== "Yes") {
      return "Eligibility must be confirmed as Yes to proceed.";
    }

    if (form.nomineeConsentConfirmed !== "Yes") {
      return "Nominee consent must be confirmed as Yes to proceed.";
    }

    if (!form.nominatorFullName.trim()) {
      return "Nominator full name is required.";
    }

    if (!isValidPhone(form.nominatorPhone)) {
      return "Nominator phone is invalid.";
    }

    if (!isValidEmail(form.nominatorEmail)) {
      return "Nominator email is invalid.";
    }

    if (!form.nominatorRelationship.trim()) {
      return "Relationship to nominee is required.";
    }

    if (form.nominatorRelationship === "Other" && !form.nominatorRelationshipOther.trim()) {
      return "Please provide relationship details for 'Other'.";
    }

    const isBusiness = AWARD_DEFINITIONS[form.awardCategory].isBusiness;

    if (isBusiness) {
      if (!form.businessName.trim()) return "Business name is required.";
      if (!form.ownerManagerName.trim()) return "Owner / manager name is required.";
      if (!isValidPhone(form.businessPhone)) return "Business phone is invalid.";
      if (!isValidEmail(form.businessEmail)) return "Business email is invalid.";
    } else {
      if (!form.nomineeFullName.trim()) return "Nominee full name is required.";
      if (!isValidPhone(form.nomineePhone)) return "Nominee phone is invalid.";
      if (!isValidEmail(form.nomineeEmail)) return "Nominee email is invalid.";
    }

    const cvRequirement = AWARD_DEFINITIONS[form.awardCategory].cvRequirement;
    if (cvRequirement === "Required" && !form.cvUrl.trim()) {
      return "CV URL is required for this category.";
    }

    if (isRisingStar) {
      if (!form.dateOfBirth) {
        return "Date of birth is required for Rising Star.";
      }
    }

    if (needsParentBlock) {
      if (!form.parentGuardianName.trim()) return "Parent/Guardian name is required.";
      if (!isValidPhone(form.parentPhone)) return "Parent phone is invalid.";
      if (!isValidEmail(form.parentEmail)) return "Parent email is invalid.";
      if (!form.parentConsentConfirmed) return "Parent/guardian consent is required for nominee under 18.";
    }

    for (const question of visibleAwardQuestions) {
      if (!question.required) continue;
      const value = answerFor(form, question.id).trim();
      if (!value) {
        return `Required field missing: ${question.label}`;
      }
    }

    if (referees.length !== 2) {
      return "Exactly two referees are required.";
    }

    for (let i = 0; i < referees.length; i += 1) {
      const referee = referees[i];
      if (!referee.name.trim()) return `Referee ${i + 1} name is required.`;
      if (!isValidEmail(referee.email)) return `Referee ${i + 1} email is invalid.`;
      if (!isValidPhone(referee.phone)) return `Referee ${i + 1} phone is invalid.`;
      if (!referee.relation.trim()) return `Referee ${i + 1} relationship is required.`;
      if (referee.relation.toLowerCase() === "family") {
        return "Immediate family members are not eligible referees.";
      }
      if (referee.relation === "Other" && !referee.relationOther.trim()) {
        return `Referee ${i + 1} relationship details are required for 'Other'.`;
      }
    }

    return "";
  }

  async function submitAll() {
    setNominationError("");

    const validationError = validateClientSide();
    if (validationError) {
      setNominationError(validationError);
      return;
    }

    try {
      setFinalSubmitting(true);
      const response = await fetch("/api/airtable/nominations/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          referees,
          awardResponses: visibleAwardQuestions.map((question) => ({
            questionId: question.id,
            question: question.label,
            answer: answerFor(form, question.id),
          })),
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setNominationError(payload.error || "Nomination validation failed.");
        return;
      }

      setFinalSubmitted(true);
    } catch (error) {
      setNominationError(error instanceof Error ? error.message : "Nomination validation failed.");
    } finally {
      setFinalSubmitting(false);
    }
  }

  return (
    <main className="nominations-page">
      <div className="hero-bg" />
      <section className="hero-card">
        <p className="kicker">South Asian Inspirational Awards</p>
        <h1>Nomination Portal</h1>
        <p>Complete the nomination workflow and assign two non-family referees.</p>
      </section>

      {finalSubmitted && (
        <section className="panel success-box">
          <h2>Nomination Submitted</h2>
          <p>The nomination has been submitted and referee requests were generated.</p>
        </section>
      )}

      {!finalSubmitted && (
        <>
          <section className="panel">
            <h2>1. City and Award</h2>
            <p className="supporting-text">Select city, award category, and referral deadline.</p>
            {bootstrapLoading && <p className="supporting-text">Loading Airtable data...</p>}
            {bootstrapError && <p className="error-text">Airtable load failed: {bootstrapError}</p>}

            <div className="form-grid">
              <div className="field-group">
                <span className="field-label">City</span>
                <div className="radio-row">
                  {cityOptions.map((city) => (
                    <label key={city.id}>
                      <input
                        type="radio"
                        name="city"
                        checked={form.city === city.name}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            city: city.name,
                            awardCategory: "",
                            awardAnswers: {},
                          }))
                        }
                      />
                      {city.name}
                    </label>
                  ))}
                </div>
              </div>

              <label>
                Award category
                <select
                  value={form.awardCategory}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      awardCategory: event.target.value,
                      awardAnswers: {},
                    }))
                  }
                >
                  <option value="">Select category</option>
                  {filteredAwards.map((award) => (
                    <option key={award.id} value={award.name}>
                      {award.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Referee deadline
                <input
                  type="date"
                  min={today}
                  value={form.nominationDeadline}
                  onChange={(event) => updateField("nominationDeadline", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <h2>2. Qualifying and Consent</h2>
            <div className="form-grid">
              <label>
                Eligibility confirmed?
                <select
                  value={form.eligibilityConfirmed}
                  onChange={(event) => updateField("eligibilityConfirmed", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>

              <label>
                Nominee consent confirmed?
                <select
                  value={form.nomineeConsentConfirmed}
                  onChange={(event) => updateField("nomineeConsentConfirmed", event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
            </div>
          </section>

          <section className="panel">
            <h2>3. Nominator Information</h2>
            <div className="form-grid">
              <label>
                Nominator full name
                <input
                  type="text"
                  value={form.nominatorFullName}
                  onChange={(event) => updateField("nominatorFullName", event.target.value)}
                />
              </label>

              <label>
                Nominator phone
                <input
                  type="tel"
                  value={form.nominatorPhone}
                  onChange={(event) => updateField("nominatorPhone", event.target.value)}
                  placeholder="###-###-####"
                />
              </label>

              <label>
                Nominator email
                <input
                  type="email"
                  value={form.nominatorEmail}
                  onChange={(event) => updateField("nominatorEmail", event.target.value)}
                />
              </label>

              <label>
                Relationship to nominee
                <select
                  value={form.nominatorRelationship}
                  onChange={(event) => updateField("nominatorRelationship", event.target.value)}
                >
                  <option value="">Select relation</option>
                  {NOMINATOR_RELATIONSHIP_OPTIONS.map((relation) => (
                    <option key={relation} value={relation}>
                      {relation}
                    </option>
                  ))}
                </select>
              </label>

              {form.nominatorRelationship === "Other" && (
                <label className="full-row">
                  Relationship details
                  <input
                    type="text"
                    value={form.nominatorRelationshipOther}
                    onChange={(event) => updateField("nominatorRelationshipOther", event.target.value)}
                  />
                </label>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>4. Nominee Information</h2>
            {!awardDefinition && (
              <p className="supporting-text">Select an award category to continue nominee details.</p>
            )}

            {awardDefinition && !awardDefinition.isBusiness && (
              <div className="form-grid">
                <label>
                  Nominee full name
                  <input
                    type="text"
                    value={form.nomineeFullName}
                    onChange={(event) => updateField("nomineeFullName", event.target.value)}
                  />
                </label>

                <label>
                  Nominee phone
                  <input
                    type="tel"
                    value={form.nomineePhone}
                    onChange={(event) => updateField("nomineePhone", event.target.value)}
                  />
                </label>

                <label>
                  Nominee email
                  <input
                    type="email"
                    value={form.nomineeEmail}
                    onChange={(event) => updateField("nomineeEmail", event.target.value)}
                  />
                </label>

                <label>
                  Gender
                  <select
                    value={form.gender}
                    onChange={(event) => updateField("gender", event.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </label>
              </div>
            )}

            {awardDefinition && awardDefinition.isBusiness && (
              <div className="form-grid">
                <label>
                  Business name
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={(event) => updateField("businessName", event.target.value)}
                  />
                </label>

                <label>
                  Owner / manager name
                  <input
                    type="text"
                    value={form.ownerManagerName}
                    onChange={(event) => updateField("ownerManagerName", event.target.value)}
                  />
                </label>

                <label>
                  Business phone
                  <input
                    type="tel"
                    value={form.businessPhone}
                    onChange={(event) => updateField("businessPhone", event.target.value)}
                  />
                </label>

                <label>
                  Business email
                  <input
                    type="email"
                    value={form.businessEmail}
                    onChange={(event) => updateField("businessEmail", event.target.value)}
                  />
                </label>

                <label>
                  Website link
                  <input
                    type="url"
                    value={form.websiteLink}
                    onChange={(event) => updateField("websiteLink", event.target.value)}
                  />
                </label>

                <label>
                  Social media links
                  <input
                    type="text"
                    value={form.socialMediaLinks}
                    onChange={(event) => updateField("socialMediaLinks", event.target.value)}
                  />
                </label>
              </div>
            )}

            {awardDefinition && awardDefinition.cvRequirement !== "Not Required" && (
              <div className="form-grid">
                <label className="full-row">
                  CV URL {awardDefinition.cvRequirement === "Required" ? "(Required)" : "(Optional)"}
                  <input
                    type="url"
                    value={form.cvUrl}
                    onChange={(event) => updateField("cvUrl", event.target.value)}
                    placeholder="https://..."
                  />
                </label>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>5. Award-Specific Questions</h2>
            {!awardDefinition && <p className="supporting-text">Select an award category first.</p>}

            {awardDefinition && (
              <div className="form-grid">
                {isRisingStar && (
                  <label>
                    Date of Birth (Required)
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) => updateField("dateOfBirth", event.target.value)}
                    />
                  </label>
                )}

                {visibleAwardQuestions.map((question) => {
                  const value = answerFor(form, question.id);

                  if (question.type === "textarea") {
                    return (
                      <label className="full-row" key={question.id}>
                        {question.label}
                        <textarea
                          rows={4}
                          value={value}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              awardAnswers: {
                                ...current.awardAnswers,
                                [question.id]: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    );
                  }

                  if (question.type === "yesNo") {
                    return (
                      <label key={question.id}>
                        {question.label}
                        <select
                          value={value}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              awardAnswers: {
                                ...current.awardAnswers,
                                [question.id]: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </label>
                    );
                  }

                  if (question.type === "select") {
                    return (
                      <label key={question.id}>
                        {question.label}
                        <select
                          value={value}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              awardAnswers: {
                                ...current.awardAnswers,
                                [question.id]: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Select</option>
                          {(question.options || []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  return (
                    <label key={question.id}>
                      {question.label}
                      <input
                        type="text"
                        value={value}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            awardAnswers: {
                              ...current.awardAnswers,
                              [question.id]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  );
                })}

                {needsParentBlock && (
                  <>
                    <label>
                      Parent/Guardian Name
                      <input
                        type="text"
                        value={form.parentGuardianName}
                        onChange={(event) => updateField("parentGuardianName", event.target.value)}
                      />
                    </label>

                    <label>
                      Parent Phone
                      <input
                        type="tel"
                        value={form.parentPhone}
                        onChange={(event) => updateField("parentPhone", event.target.value)}
                      />
                    </label>

                    <label>
                      Parent Email
                      <input
                        type="email"
                        value={form.parentEmail}
                        onChange={(event) => updateField("parentEmail", event.target.value)}
                      />
                    </label>

                    <label>
                      <input
                        type="checkbox"
                        checked={form.parentConsentConfirmed}
                        onChange={(event) => updateField("parentConsentConfirmed", event.target.checked)}
                      />
                      Parent/Guardian consent confirmed
                    </label>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>6. Referee Contact Details</h2>
            <p className="supporting-text">Immediate family members are not eligible referees.</p>

            <div className="form-grid">
              {referees.map((referee, index) => (
                <div key={`referee-${index}`} className="referee-block">
                  <h3>Referee {index + 1}</h3>
                  <label>
                    Full name
                    <input
                      type="text"
                      value={referee.name}
                      onChange={(event) =>
                        setReferees((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, name: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </label>

                  <label>
                    Email
                    <input
                      type="email"
                      value={referee.email}
                      onChange={(event) =>
                        setReferees((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, email: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </label>

                  <label>
                    Phone
                    <input
                      type="tel"
                      value={referee.phone}
                      onChange={(event) =>
                        setReferees((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, phone: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </label>

                  <label>
                    Relationship to nominee
                    <select
                      value={referee.relation}
                      onChange={(event) =>
                        setReferees((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? {
                                  ...entry,
                                  relation: event.target.value,
                                  relationOther:
                                    event.target.value === "Other" ? entry.relationOther : "",
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="">Select relation</option>
                      {REFEREE_RELATIONSHIP_OPTIONS.map((relation) => (
                        <option key={relation} value={relation}>
                          {relation}
                        </option>
                      ))}
                    </select>
                  </label>

                  {referee.relation === "Other" && (
                    <label>
                      Relationship details
                      <input
                        type="text"
                        value={referee.relationOther}
                        onChange={(event) =>
                          setReferees((current) =>
                            current.map((entry, i) =>
                              i === index ? { ...entry, relationOther: event.target.value } : entry,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                </div>
              ))}

              {nominationError && <p className="error-text">{nominationError}</p>}
            </div>
          </section>

          <section className="panel">
            <button
              type="button"
              className="primary-btn"
              disabled={finalSubmitting || finalSubmitted}
              onClick={submitAll}
            >
              {finalSubmitting ? "Submitting..." : "Submit Nomination"}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
