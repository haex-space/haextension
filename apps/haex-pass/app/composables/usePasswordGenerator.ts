export interface IPasswordConfig {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeChars: string | null;
  usePattern: boolean;
  pattern: string | null;
}

export const usePasswordGenerator = () => {
  const getRandomChar = (charset: string): string => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const randomValue = array[0] ?? 0;
    const index = randomValue % charset.length;
    return charset.charAt(index);
  };

  const generate = (config: IPasswordConfig) => {
    // 1. Pattern-Logik
    if (config.usePattern && config.pattern) {
      const patternMap: Record<string, string> = {
        c: "bcdfghjklmnpqrstvwxyz",
        C: "BCDFGHJKLMNPQRSTVWXYZ",
        v: "aeiou",
        V: "AEIOU",
        d: "0123456789",
        a: "abcdefghijklmnopqrstuvwxyz",
        A: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        s: "!@#$%^&*()_+-=[]{}|;:,.<>?",
      };

      return config.pattern
        .split("")
        .map((char) =>
          patternMap[char] ? getRandomChar(patternMap[char]) : char
        )
        .join("");
    }

    // 2. Standard-Logik
    const charset = {
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      numbers: "0123456789",
      symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
    };

    let chars = "";
    if (config.uppercase) chars += charset.uppercase;
    if (config.lowercase) chars += charset.lowercase;
    if (config.numbers) chars += charset.numbers;
    if (config.symbols) chars += charset.symbols;

    if (config.excludeChars) {
      const excludeSet = new Set(config.excludeChars.split(""));
      chars = chars
        .split("")
        .filter((c) => !excludeSet.has(c))
        .join("");
    }

    if (!chars) return "";

    const array = new Uint32Array(config.length);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map((x) => chars[x % chars.length])
      .join("");
  };

  return {
    generate,
  };
};
