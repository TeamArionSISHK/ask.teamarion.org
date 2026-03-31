export interface ImageAsset {
  tag: string;
  path: string;
  alt: string;
}

export const imageAssets: Record<string, ImageAsset> = {
  car: {
    tag: 'car',
    path: '/images/car-isometric.png',
    alt: 'Team Arion car isometric view',
  },
  aerodynamics: {
    tag: 'aerodynamics',
    path: '/images/car-side.png',
    alt: 'Team Arion car side view highlighting body shape',
  },
  team: {
    tag: 'team',
    path: '/images/team-arion-gradient.jpg',
    alt: 'Team Arion visual identity artwork',
  },
  'ai-system': {
    tag: 'ai-system',
    path: '/images/team-arion-mark.png',
    alt: 'Team Arion brand mark',
  },
};

export const allowedImageTags = Object.keys(imageAssets);

const tagKeywords: Record<string, string[]> = {
  car: ['car', 'vehicle', 'design', 'competition car'],
  aerodynamics: ['aerodynamic', 'drag', 'downforce', 'airflow', 'shape'],
  team: ['team', 'students', 'engineering', 'exhibition'],
  'ai-system': ['ai', 'prompt', 'workflow', 'generation', 'interactive'],
};

export function inferImageTagsFromText(...inputs: string[]) {
  const haystack = inputs.join(' ').toLowerCase();
  const matches = allowedImageTags.filter((tag) =>
    tagKeywords[tag]?.some((keyword) => haystack.includes(keyword)),
  );

  return matches.slice(0, 2);
}
