const AVATAR_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
];

export const getAvatarInitials = (name: string | undefined, email: string): string => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
    }
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
};

export const getAvatarColor = (email: string): string => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
};
