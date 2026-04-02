export const SUPPORTED_CITIES = ["Edmonton", "Calgary"] as const;

export const AWARD_CATEGORIES = [
  "Community Leader",
  "Community Volunteer",
  "Professional Leader",
  "Outstanding Achievement in STEEM",
  "Outstanding Business",
  "Still Going Strong",
  "Outstanding Achievement in Arts & Culture",
  "Outstanding Achievement in Media",
  "Outstanding Achievement in Sports",
  "Rising Star",
  "Lifetime Achievement",
] as const;

export type AwardCategory = (typeof AWARD_CATEGORIES)[number];

export type QuestionType = "textarea" | "text" | "yesNo" | "select";

export type AwardQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  dependsOn?: {
    id: string;
    value: string;
  };
};

export type AwardDefinition = {
  isBusiness: boolean;
  cvRequirement: "Required" | "Optional" | "Not Required";
  nominationQuestions: AwardQuestion[];
  refereeQuestions: string[];
};

const accomplishmentAreas = [
  "Education",
  "Business",
  "Community Service",
  "Arts & Culture",
  "Media",
  "Sports",
  "STEEM",
  "Other",
];

export const NOMINATOR_RELATIONSHIP_OPTIONS = [
  "Professional Colleague",
  "Friend",
  "Family",
  "Self",
  "Other",
] as const;

export const REFEREE_RELATIONSHIP_OPTIONS = [
  "Professional Colleague",
  "Friend",
  "Family",
  "Other",
] as const;

export const AWARD_DEFINITIONS: Record<AwardCategory, AwardDefinition> = {
  "Community Leader": {
    isBusiness: false,
    cvRequirement: "Required",
    nominationQuestions: [
      {
        id: "leadershipQualities",
        label: "Describe nominee's leadership qualities (300-500 words)",
        type: "textarea",
        required: true,
      },
      {
        id: "leadershipInitiatives",
        label: "Provide at least TWO examples of leadership initiatives",
        type: "textarea",
        required: true,
      },
      {
        id: "leadershipImpact",
        label: "Impact of leadership on community",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe leadership skills",
      "Example of leadership initiative",
      "Additional comments",
    ],
  },
  "Community Volunteer": {
    isBusiness: false,
    cvRequirement: "Not Required",
    nominationQuestions: [
      {
        id: "volunteerQualities",
        label: "Describe volunteer qualities",
        type: "textarea",
        required: true,
      },
      {
        id: "volunteerExample",
        label: "At least ONE example of volunteer work (include where/when)",
        type: "textarea",
        required: true,
      },
      {
        id: "volunteerImpact",
        label: "Impact on community/environment",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe volunteer qualities",
      "Example of volunteerism",
      "Additional comments",
    ],
  },
  "Professional Leader": {
    isBusiness: false,
    cvRequirement: "Required",
    nominationQuestions: [
      {
        id: "professionAndDuties",
        label: "Profession and professional duties",
        type: "textarea",
        required: true,
      },
      {
        id: "professionalLinks",
        label: "Business website/social links (if applicable)",
        type: "text",
        required: false,
      },
      {
        id: "professionalContribution",
        label: "At least ONE example of exceptional professional contribution",
        type: "textarea",
        required: true,
      },
      {
        id: "professionalPracticeChange",
        label: "Has this changed professional practice or governance?",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe exceptional contribution",
      "Additional insights",
    ],
  },
  "Outstanding Achievement in STEEM": {
    isBusiness: false,
    cvRequirement: "Required",
    nominationQuestions: [
      {
        id: "steemConnection",
        label: "Describe connection to STEEM",
        type: "textarea",
        required: true,
      },
      {
        id: "steemTiedToProfession",
        label: "Is this tied to profession?",
        type: "yesNo",
        required: true,
      },
      {
        id: "steemProfession",
        label: "Profession",
        type: "text",
        required: true,
        dependsOn: { id: "steemTiedToProfession", value: "Yes" },
      },
      {
        id: "steemInnovation",
        label: "Example of innovation/change created",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe accomplishment",
      "Explain innovation/impact",
    ],
  },
  "Outstanding Business": {
    isBusiness: true,
    cvRequirement: "Not Required",
    nominationQuestions: [
      {
        id: "businessDescription",
        label: "Business description (services + how long operating)",
        type: "textarea",
        required: true,
      },
      {
        id: "businessReputation",
        label: "Examples of reputation/ethics/quality",
        type: "textarea",
        required: true,
      },
      {
        id: "businessCommunityContribution",
        label: "Example of community contribution",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship to business",
      "What does business do?",
      "Describe business + community support",
      "Example of reputation/ethics",
      "Additional comments",
    ],
  },
  "Still Going Strong": {
    isBusiness: false,
    cvRequirement: "Not Required",
    nominationQuestions: [
      {
        id: "stillGoingStrongAgeConfirmed",
        label: "Is the nominee 65 or older this calendar year?",
        type: "yesNo",
        required: true,
      },
      {
        id: "stillGoingStrongArea",
        label: "Area of accomplishment",
        type: "select",
        options: accomplishmentAreas,
        required: true,
      },
      {
        id: "stillGoingStrongExample",
        label: "At least ONE example (when/where/ongoing)",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe accomplishment",
      "Additional insights",
    ],
  },
  "Outstanding Achievement in Arts & Culture": {
    isBusiness: false,
    cvRequirement: "Required",
    nominationQuestions: [
      {
        id: "artsInvolvement",
        label: "Describe involvement in arts/entertainment (include links)",
        type: "textarea",
        required: true,
      },
      {
        id: "artsAccomplishmentMentorship",
        label: "At least ONE example of accomplishment + mentorship",
        type: "textarea",
        required: true,
      },
      {
        id: "artsCommunityContribution",
        label: "Contribution leading to change in the arts scene in selected city",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe arts involvement",
      "Achievements + mentorship",
      "Community contribution",
      "Additional comments",
    ],
  },
  "Outstanding Achievement in Media": {
    isBusiness: false,
    cvRequirement: "Required",
    nominationQuestions: [
      {
        id: "mediaInvolvement",
        label: "Describe media involvement",
        type: "textarea",
        required: true,
      },
      {
        id: "mediaAchievement",
        label: "Example of media achievement",
        type: "textarea",
        required: true,
      },
      {
        id: "mediaCommunityContribution",
        label: "Contribution leading to positive change in the community",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Media involvement",
      "Achievements",
      "Community impact",
      "Additional comments",
    ],
  },
  "Outstanding Achievement in Sports": {
    isBusiness: false,
    cvRequirement: "Not Required",
    nominationQuestions: [
      {
        id: "sportsInvolvement",
        label: "Describe sports involvement (how long, where)",
        type: "textarea",
        required: true,
      },
      {
        id: "sportsAchievement",
        label: "Example of athletic accomplishment/leadership",
        type: "textarea",
        required: true,
      },
      {
        id: "sportsCommunityContribution",
        label: "Contribution leading to positive change in the community",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Sports achievements + leadership",
      "Community impact",
      "Additional comments",
    ],
  },
  "Rising Star": {
    isBusiness: false,
    cvRequirement: "Not Required",
    nominationQuestions: [
      {
        id: "risingStarAgeConfirmed",
        label: "Is nominee between 14-19 this calendar year?",
        type: "yesNo",
        required: true,
      },
      {
        id: "risingStarArea",
        label: "Area of accomplishment",
        type: "select",
        options: accomplishmentAreas,
        required: true,
      },
      {
        id: "risingStarExample",
        label: "At least ONE example",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Why deserving?",
      "Most significant accomplishment",
      "Additional comments",
    ],
  },
  "Lifetime Achievement": {
    isBusiness: false,
    cvRequirement: "Required",
    nominationQuestions: [
      {
        id: "lifetimeContribution",
        label: "Describe overall contribution",
        type: "textarea",
        required: true,
      },
      {
        id: "lifetimeMajorAccomplishment",
        label: "At least ONE major accomplishment",
        type: "textarea",
        required: true,
      },
      {
        id: "lifetimeImpact",
        label: "Impact on organizations/programs/history",
        type: "textarea",
        required: true,
      },
    ],
    refereeQuestions: [
      "Relationship",
      "Describe qualities",
      "Lifetime accomplishments",
      "Additional insights",
    ],
  },
};

export function isAwardCategory(value: string): value is AwardCategory {
  return AWARD_CATEGORIES.includes(value as AwardCategory);
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

export function isValidEmail(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length === 10;
}

export function getAgeOnDate(dateOfBirth: string, onDate: Date): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return -1;
  }

  let age = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = onDate.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && onDate.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}
