export type HearingQuestion = {
  id: string;
  prompt: string;
  help?: string;
  type: "single" | "multi" | "text";
  options?: string[];
  required?: boolean;
};

export type HearingResult = {
  summary: {
    purpose: string;
    target: string;
    mainAppeal: string;
    structureHypothesis: string;
    designDirection: string;
    unresolved: string[];
  };
  questions: HearingQuestion[];
  ready: boolean;
  assistantMessage: string;
};

export type GeneratedPage = {
  html: string;
  css: string;
  sections: Array<{ id: string; title: string; description: string }>;
  note: string;
};
