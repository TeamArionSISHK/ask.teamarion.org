export interface OfficialActionPayload {
  id: string;
  label: string;
  href: string;
  kind: 'email' | 'external';
}

const OFFICIAL_ACTIONS = {
  sponsorshipEmail: {
    id: 'sponsorship-email',
    label: 'Email sponsorship lead',
    href: 'mailto:chanpongsangnithit@apps.singapore.edu.hk',
    kind: 'email',
  },
  generalEmail: {
    id: 'team-email',
    label: 'Email Team Arion',
    href: 'mailto:teamarion@apps.singapore.edu.hk',
    kind: 'email',
  },
  teamWebsite: {
    id: 'team-website',
    label: 'Visit website',
    href: 'https://www.teamarion.org',
    kind: 'external',
  },
  schoolWebsite: {
    id: 'school-website',
    label: 'Visit school website',
    href: 'https://www.singapore.edu.hk',
    kind: 'external',
  },
  linkedIn: {
    id: 'team-linkedin',
    label: 'Open LinkedIn',
    href: 'https://www.linkedin.com/company/teamarion/',
    kind: 'external',
  },
  instagram: {
    id: 'team-instagram',
    label: 'Open Instagram',
    href: 'https://www.instagram.com/teamarionhk/',
    kind: 'external',
  },
  github: {
    id: 'team-github',
    label: 'Open GitHub',
    href: 'https://github.com/TeamArionSISHK',
    kind: 'external',
  },
  stemRacingWebsite: {
    id: 'stem-racing-website',
    label: 'Visit STEM Racing website',
    href: 'https://www.stemracing.com',
    kind: 'external',
  },
} satisfies Record<string, OfficialActionPayload>;

const sponsorshipKeywords = [
  'sponsor',
  'sponsorship',
  'partner',
  'partnership',
  'collaboration',
  'collaborate',
  'support us',
  'support the team',
  'sponsor roi',
  'funding',
];

const schoolKeywords = [
  'school',
  'sishk',
  'singapore international school',
  '新加坡国际学校',
];

const stemRacingKeywords = [
  'stem racing',
  'f1 in schools',
  'competition',
  'world finals',
  'regional finals',
  'hkmo finals',
];

const generalContactKeywords = [
  'contact',
  'email',
  'enquiry',
  'enquiries',
  'inquiry',
  'inquiries',
  'reach us',
  'reach the team',
  'get in touch',
  'website',
  'linkedin',
  'instagram',
  'social media',
];

const openSourceKeywords = [
  'open source',
  'open-source',
  'github',
  'software',
  'tools',
  'infrastructure',
  'purplereaction',
  'propit',
  'purpleshortener',
];

function includesAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function deriveOfficialActions(text: string, userPrompt = ''): OfficialActionPayload[] {
  const normalized = text.toLowerCase();
  const normalizedPrompt = userPrompt.toLowerCase();
  const selected = new Map<string, OfficialActionPayload>();

  const add = (action: OfficialActionPayload) => {
    if (!selected.has(action.id) && selected.size < 3) {
      selected.set(action.id, action);
    }
  };

  if (includesAnyKeyword(normalized, sponsorshipKeywords)) {
    add(OFFICIAL_ACTIONS.sponsorshipEmail);
    add(OFFICIAL_ACTIONS.teamWebsite);
    add(OFFICIAL_ACTIONS.linkedIn);
  }

  if (includesAnyKeyword(normalizedPrompt, schoolKeywords)) {
    add(OFFICIAL_ACTIONS.schoolWebsite);
  }

  if (includesAnyKeyword(normalizedPrompt, stemRacingKeywords)) {
    add(OFFICIAL_ACTIONS.stemRacingWebsite);
  }

  if (includesAnyKeyword(normalized, openSourceKeywords)) {
    add(OFFICIAL_ACTIONS.github);
    add(OFFICIAL_ACTIONS.teamWebsite);
  }

  if (includesAnyKeyword(normalized, generalContactKeywords)) {
    add(OFFICIAL_ACTIONS.generalEmail);
    add(OFFICIAL_ACTIONS.teamWebsite);
    add(OFFICIAL_ACTIONS.instagram);
  }

  if (normalized.includes('linkedin')) {
    add(OFFICIAL_ACTIONS.linkedIn);
  }

  if (normalized.includes('instagram') || normalized.includes('social media')) {
    add(OFFICIAL_ACTIONS.instagram);
  }

  return Array.from(selected.values());
}
