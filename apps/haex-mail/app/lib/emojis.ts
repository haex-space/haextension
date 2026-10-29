// A small, curated emoji set for the compose editor, grouped for a picker.
// Emojis are plain text, so they work in the editor, in Markdown and in mail.

export interface EmojiGroup {
  key: string;
  icon: string;
  emojis: string[];
}

// Graphemes, not code points: ✌️ is two code points (with a variation selector).
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const chars = (text: string) =>
  Array.from(segmenter.segment(text.replace(/\s+/g, "")), (s) => s.segment);

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: "smileys",
    icon: "😀",
    emojis: chars(
      "😀😃😄😁😆😅😂🤣🙂😉😊😇🥰😍🤩😘😋😛😜🤪🤔🤗🤭🫡😎🤓🧐😏😌😴😮😯😲😳🥺😢😭😤😠😡🤯😱😰😥😓🙄😬🤐😷🤒🤕🥳🥲🫠",
    ),
  },
  {
    key: "gestures",
    icon: "👍",
    emojis: chars(
      "👍👎👌🤌✌️🤞🤟🤘🤙👈👉👆👇☝️👋🤚🖐️✋🖖👏🙌🫶🤝🙏💪🫵✍️🤳👀🧠",
    ),
  },
  {
    key: "symbols",
    icon: "❤️",
    emojis: chars(
      "❤️🧡💛💚💙💜🖤🤍💔💕💖💯✅❌❗❓‼️⚠️🚫⭐🌟✨💫🔥💥🎉🎊🎁🏆🥇📌📎🔗💡🔔⏰📅",
    ),
  },
  {
    key: "objects",
    icon: "📎",
    emojis: chars(
      "📧✉️📨📩📝📄📁📂📊📈📉📋🗂️🔒🔑🛠️⚙️💻🖥️📱☎️📷🎧🚀✈️🚗🏠☕🍕🍺🎂🌍☀️🌧️❄️🌈🌱🌸🐶🐱",
    ),
  },
];
