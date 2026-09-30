import { Student, Offer, Preference } from '../types';

/**
 * 6-Student Hand-Checkable Fixture from SRS Section 21
 */
export const FIXTURE_6_OFFERS: Offer[] = [
  {
    offer_id: 'O_A',
    school_name: 'School A (GS Ste Famille)',
    province: 'Kigali',
    stage_programme: 'General Secondary (O-Level)',
    capacity: 2,
    min_overall: 50,
    weight_math: 0.4,
    weight_science: 0.4,
    weight_language: 0.2
  },
  {
    offer_id: 'O_B',
    school_name: 'School B (Lycee de Kigali)',
    province: 'Kigali',
    stage_programme: 'General Secondary (O-Level)',
    capacity: 1,
    min_overall: 50,
    weight_math: 0.35,
    weight_science: 0.35,
    weight_language: 0.3
  },
  {
    offer_id: 'O_C',
    school_name: 'School C (College St Andre)',
    province: 'Kigali',
    stage_programme: 'Sciences Focus (O-Level)',
    capacity: 1,
    min_overall: 70,
    weight_math: 0.5,
    weight_science: 0.4,
    weight_language: 0.1
  }
];

export const FIXTURE_6_STUDENTS: Student[] = [
  {
    student_id: 'S1',
    display_name: 'Student S1 (Mugisha Jean)',
    cohort_id: 'COHORT-DEMO-6',
    province: 'Kigali',
    overall_score: 90,
    math_score: 92,
    science_score: 88,
    language_score: 90,
    allow_fallback: false
  },
  {
    student_id: 'S2',
    display_name: 'Student S2 (Keza Aline)',
    cohort_id: 'COHORT-DEMO-6',
    province: 'Kigali',
    overall_score: 85,
    math_score: 86,
    science_score: 84,
    language_score: 85,
    allow_fallback: false
  },
  {
    student_id: 'S3',
    display_name: 'Student S3 (Habimana Eric)',
    cohort_id: 'COHORT-DEMO-6',
    province: 'Kigali',
    overall_score: 80,
    math_score: 82,
    science_score: 78,
    language_score: 80,
    allow_fallback: false // can be set to true in AT-04
  },
  {
    student_id: 'S4',
    display_name: 'Student S4 (Uwase Diane)',
    cohort_id: 'COHORT-DEMO-6',
    province: 'Kigali',
    overall_score: 75,
    math_score: 74,
    science_score: 76,
    language_score: 75,
    allow_fallback: false
  },
  {
    student_id: 'S5',
    display_name: 'Student S5 (Mutabazi Paul)',
    cohort_id: 'COHORT-DEMO-6',
    province: 'Kigali',
    overall_score: 65,
    math_score: 66,
    science_score: 64,
    language_score: 65,
    allow_fallback: false
  },
  {
    student_id: 'S6',
    display_name: 'Student S6 (Ingabire Grace)',
    cohort_id: 'COHORT-DEMO-6',
    province: 'Kigali',
    overall_score: 45,
    math_score: 46,
    science_score: 44,
    language_score: 45,
    allow_fallback: false
  }
];

export const FIXTURE_6_PREFERENCES: Preference[] = [
  { student_id: 'S1', offer_id: 'O_A', rank: 1 },
  { student_id: 'S1', offer_id: 'O_B', rank: 2 },
  { student_id: 'S2', offer_id: 'O_A', rank: 1 },
  { student_id: 'S3', offer_id: 'O_A', rank: 1 },
  { student_id: 'S3', offer_id: 'O_B', rank: 2 },
  { student_id: 'S4', offer_id: 'O_C', rank: 1 },
  { student_id: 'S5', offer_id: 'O_A', rank: 1 },
  { student_id: 'S5', offer_id: 'O_C', rank: 2 },
  { student_id: 'S6', offer_id: 'O_A', rank: 1 }
];

/**
 * 12 Synthetic School Offers (FR-02)
 */
export const SYNTHETIC_12_OFFERS: Offer[] = [
  {
    offer_id: 'OFF-01',
    school_name: 'GS Sainte Famille',
    province: 'Kigali',
    stage_programme: 'General Secondary (O-Level)',
    capacity: 22,
    min_overall: 65,
    weight_math: 0.35,
    weight_science: 0.35,
    weight_language: 0.30
  },
  {
    offer_id: 'OFF-02',
    school_name: 'Lycée de Kigali',
    province: 'Kigali',
    stage_programme: 'Scientific Excellence (O-Level)',
    capacity: 18,
    min_overall: 75,
    weight_math: 0.45,
    weight_science: 0.40,
    weight_language: 0.15
  },
  {
    offer_id: 'OFF-03',
    school_name: 'Collège Saint André',
    province: 'Kigali',
    stage_programme: 'Mathematics & Computing',
    capacity: 16,
    min_overall: 70,
    weight_math: 0.50,
    weight_science: 0.30,
    weight_language: 0.20
  },
  {
    offer_id: 'OFF-04',
    school_name: 'Ecole Secondaire de Nyamirambo',
    province: 'Kigali',
    stage_programme: 'General Arts & Languages',
    capacity: 20,
    min_overall: 50,
    weight_math: 0.20,
    weight_science: 0.25,
    weight_language: 0.55
  },
  {
    offer_id: 'OFF-05',
    school_name: 'GS Notre Dame des Victoires',
    province: 'Northern',
    stage_programme: 'General Sciences',
    capacity: 18,
    min_overall: 60,
    weight_math: 0.35,
    weight_science: 0.45,
    weight_language: 0.20
  },
  {
    offer_id: 'OFF-06',
    school_name: 'Petit Séminaire Rwesero',
    province: 'Northern',
    stage_programme: 'Classics & Humanities',
    capacity: 14,
    min_overall: 68,
    weight_math: 0.30,
    weight_science: 0.30,
    weight_language: 0.40
  },
  {
    offer_id: 'OFF-07',
    school_name: 'GS Officiel de Butare (Indatwa)',
    province: 'Southern',
    stage_programme: 'Elite Academic Cohort',
    capacity: 15,
    min_overall: 78,
    weight_math: 0.40,
    weight_science: 0.40,
    weight_language: 0.20
  },
  {
    offer_id: 'OFF-08',
    school_name: 'Collège du Christ-Roi Nyanza',
    province: 'Southern',
    stage_programme: 'General Sciences',
    capacity: 17,
    min_overall: 65,
    weight_math: 0.40,
    weight_science: 0.35,
    weight_language: 0.25
  },
  {
    offer_id: 'OFF-09',
    school_name: 'GS Gahini Secondary',
    province: 'Eastern',
    stage_programme: 'Agricultural & Applied Science',
    capacity: 19,
    min_overall: 55,
    weight_math: 0.30,
    weight_science: 0.50,
    weight_language: 0.20
  },
  {
    offer_id: 'OFF-10',
    school_name: 'Rwamagana Leaders Academy',
    province: 'Eastern',
    stage_programme: 'Leadership & STEM',
    capacity: 15,
    min_overall: 72,
    weight_math: 0.45,
    weight_science: 0.35,
    weight_language: 0.20
  },
  {
    offer_id: 'OFF-11',
    school_name: 'Ecole Secondaire de Gisenyi',
    province: 'Western',
    stage_programme: 'Bilingual Sciences',
    capacity: 18,
    min_overall: 58,
    weight_math: 0.35,
    weight_science: 0.35,
    weight_language: 0.30
  },
  {
    offer_id: 'OFF-12',
    school_name: 'Collège de Kibuye',
    province: 'Western',
    stage_programme: 'General O-Level Track',
    capacity: 16,
    min_overall: 50,
    weight_math: 0.30,
    weight_science: 0.30,
    weight_language: 0.40
  }
];

/**
 * Deterministic pseudo-random generator with fixed seed
 */
function createSeededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const FIRST_NAMES = [
  'Jean', 'Aline', 'Eric', 'Diane', 'Paul', 'Grace', 'Emmanuel', 'Chantal',
  'Patrick', 'Sandrine', 'Claude', 'Alice', 'David', 'Marie', 'Olivier',
  'Clarisse', 'Fabrice', 'Jeanne', 'Innocent', 'Solange', 'Vincent', 'Nathalie'
];

const LAST_NAMES = [
  'Mugisha', 'Keza', 'Habimana', 'Uwase', 'Mutabazi', 'Ingabire', 'Bizimana',
  'Mukamana', 'Nshimiyimana', 'Uwera', 'Kwizera', 'Uwamahoro', 'Hakizimana',
  'Kayitesi', 'Ndahiro', 'Mukeshimana', 'Nkurunziza', 'Gakwaya', 'Gasana', 'Makuza'
];

const PROVINCES = ['Kigali', 'Northern', 'Southern', 'Eastern', 'Western'];

/**
 * Generate synthetic student cohort
 */
export function generateSyntheticCohort(
  count: number = 200,
  seed: number = 42,
  offers: Offer[] = SYNTHETIC_12_OFFERS
): { students: Student[]; preferences: Preference[] } {
  const rand = createSeededRandom(seed);
  const students: Student[] = [];
  const preferences: Preference[] = [];

  for (let i = 1; i <= count; i++) {
    const sId = `S${String(i).padStart(count >= 1000 ? 4 : 3, '0')}`;
    const fName = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const lName = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const province = PROVINCES[Math.floor(rand() * PROVINCES.length)];

    // Realistic normal-ish score distribution between 38 and 96
    const baseScore = Math.floor(40 + rand() * 30 + rand() * 26);
    const mathDelta = Math.floor((rand() - 0.5) * 16);
    const sciDelta = Math.floor((rand() - 0.5) * 16);
    const langDelta = Math.floor((rand() - 0.5) * 16);

    const overall = Math.min(99, Math.max(35, baseScore));
    const math = Math.min(100, Math.max(30, overall + mathDelta));
    const science = Math.min(100, Math.max(30, overall + sciDelta));
    const language = Math.min(100, Math.max(30, overall + langDelta));

    // 78% opt-in to fallback recommendations
    const allowFallback = rand() < 0.78;

    students.push({
      student_id: sId,
      display_name: `${lName} ${fName}`,
      cohort_id: 'COHORT-RW-2026-SYNTH',
      province,
      overall_score: overall,
      math_score: math,
      science_score: science,
      language_score: language,
      allow_fallback: allowFallback
    });

    // Pick 3 unique ranked choices from available offers
    const offerIndices = [...Array(offers.length).keys()];
    // Shuffle indices with seeded rand
    for (let j = offerIndices.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [offerIndices[j], offerIndices[k]] = [offerIndices[k], offerIndices[j]];
    }

    // Assign 3 choices
    for (let r = 1; r <= 3; r++) {
      preferences.push({
        student_id: sId,
        offer_id: offers[offerIndices[r - 1]].offer_id,
        rank: r as 1 | 2 | 3
      });
    }
  }

  return { students, preferences };
}

/**
 * 500-Student Stress Cohort for NFR-02 & AT-08
 */
export function generateStressBenchmark(): { students: Student[]; offers: Offer[]; preferences: Preference[] } {
  // 20 offers
  const stressOffers: Offer[] = [
    ...SYNTHETIC_12_OFFERS,
    {
      offer_id: 'OFF-13',
      school_name: 'GS Remera Protestant',
      province: 'Kigali',
      stage_programme: 'General Sciences',
      capacity: 25,
      min_overall: 60,
      weight_math: 0.35,
      weight_science: 0.35,
      weight_language: 0.30
    },
    {
      offer_id: 'OFF-14',
      school_name: 'Ecole Secondaire de Kicukiro',
      province: 'Kigali',
      stage_programme: 'Technical Preparatory Track',
      capacity: 25,
      min_overall: 52,
      weight_math: 0.40,
      weight_science: 0.40,
      weight_language: 0.20
    },
    {
      offer_id: 'OFF-15',
      school_name: 'GS Byumba Inyange',
      province: 'Northern',
      stage_programme: 'O-Level General',
      capacity: 22,
      min_overall: 55,
      weight_math: 0.30,
      weight_science: 0.30,
      weight_language: 0.40
    },
    {
      offer_id: 'OFF-16',
      school_name: 'Collège Adventiste de Gitwe',
      province: 'Southern',
      stage_programme: 'Health & Biology Sciences',
      capacity: 20,
      min_overall: 66,
      weight_math: 0.30,
      weight_science: 0.50,
      weight_language: 0.20
    },
    {
      offer_id: 'OFF-17',
      school_name: 'GS Nyagatare Secondary',
      province: 'Eastern',
      stage_programme: 'Agricultural Sciences',
      capacity: 25,
      min_overall: 54,
      weight_math: 0.35,
      weight_science: 0.45,
      weight_language: 0.20
    },
    {
      offer_id: 'OFF-18',
      school_name: 'GS Kibungo Saint Joseph',
      province: 'Eastern',
      stage_programme: 'General Secondary Track',
      capacity: 24,
      min_overall: 58,
      weight_math: 0.35,
      weight_science: 0.35,
      weight_language: 0.30
    },
    {
      offer_id: 'OFF-19',
      school_name: 'GS Saint Aloys Rwamagana',
      province: 'Eastern',
      stage_programme: 'Languages & Humanities',
      capacity: 22,
      min_overall: 62,
      weight_math: 0.25,
      weight_science: 0.25,
      weight_language: 0.50
    },
    {
      offer_id: 'OFF-20',
      school_name: 'GS Rusizi Secondary',
      province: 'Western',
      stage_programme: 'Bilingual Sciences',
      capacity: 24,
      min_overall: 50,
      weight_math: 0.35,
      weight_science: 0.35,
      weight_language: 0.30
    }
  ];

  const { students, preferences } = generateSyntheticCohort(500, 101, stressOffers);
  return { students, offers: stressOffers, preferences };
}
