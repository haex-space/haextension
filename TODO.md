# TODO

Running list of follow-ups that aren't blocking but should be picked up later.

## haex-pass-browser

- **i18n for the passkey consent overlay.** The overlay rendered in the page's
  Shadow DOM (`src/contentScripts/views/PasskeyConsentPrompt.vue`) currently
  hard-codes German strings. The options page already uses the i18n
  infrastructure, but reaching the same setup from the ISOLATED content
  script context needs a separate wiring (load locale from storage, set up
  vue-i18n inside the content-script Vue app). Strings to translate:
  - "Passkey-Anfrage"
  - "<rp> möchte einen Passkey registrieren / sich mit einem Passkey anmelden"
  - "Wer soll diese Anfrage bearbeiten?"
  - "haex-vault" / "Passkey in deinem Vault speichern"
  - "Browser / Hardware-Key" / "Native WebAuthn (z.B. Yubikey, Touch-ID)"
  - "Entscheidung für <rp> merken"
  - "Abbrechen"
