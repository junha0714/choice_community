export type DefaultAiMode = "quick" | "deep" | "friend";

export type UserSettings = {
  default_ai_mode: DefaultAiMode;
  default_ai_transcript_public: boolean;
  notify_comment: boolean;
  notify_reply: boolean;
  notify_like: boolean;
  notify_vote_end: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  default_ai_mode: "quick",
  default_ai_transcript_public: false,
  notify_comment: true,
  notify_reply: true,
  notify_like: true,
  notify_vote_end: true,
};

export const AI_MODE_OPTIONS: {
  id: DefaultAiMode;
  title: string;
  description: string;
}[] = [
  {
    id: "quick",
    title: "빠른 결정",
    description: "질문 적게, 빠르게 결론",
  },
  {
    id: "deep",
    title: "깊은 분석",
    description: "성향·우선순위를 더 파고듦",
  },
  {
    id: "friend",
    title: "친구 상담",
    description: "친구랑 톡하듯 편한 톤",
  },
];

export const AI_MODE_DEFAULT_STEPS: Record<DefaultAiMode, number> = {
  quick: 4,
  deep: 7,
  friend: 5,
};
