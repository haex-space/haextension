/**
 * Mapping von KeePass Standard-Icons (Index 0-68) zu Material Design Icons
 *
 * KeePass Standard-Icons: 69 Icons (Index 0-68)
 * Nur MDI Icons werden verwendet für Konsistenz
 */
export const KEEPASS_ICON_MAP: Record<number, string> = {
  // 0: Key
  0: 'mdi:key',

  // 1: World/Globe/Internet
  1: 'mdi:web',

  // 2: Warning/Alert
  2: 'mdi:alert-outline',

  // 3: Network Server
  3: 'mdi:server',

  // 4: Clipboard
  4: 'mdi:clipboard-outline',

  // 5: Text document
  5: 'mdi:file-document-outline',

  // 6: Folder (closed)
  6: 'mdi:folder',

  // 7: Folder (open)
  7: 'mdi:folder-open-outline',

  // 8: Note/Paper
  8: 'mdi:note-outline',

  // 9: Mobile/Phone
  9: 'mdi:cellphone',

  // 10: E-Mail
  10: 'mdi:email-outline',

  // 11: Configuration/Settings
  11: 'mdi:cog-outline',

  // 12: Notepad
  12: 'mdi:notebook-outline',

  // 13: Network/WiFi
  13: 'mdi:wifi',

  // 14: Certificate
  14: 'mdi:certificate-outline',

  // 15: Terminal/Console
  15: 'mdi:console',

  // 16: Console/CMD
  16: 'mdi:console',

  // 17: Printer
  17: 'mdi:printer-outline',

  // 18: Picture/Image
  18: 'mdi:image-outline',

  // 19: Linux/Tux
  19: 'mdi:penguin',

  // 20: Apple
  20: 'mdi:apple',

  // 21: Wikipedia/Wiki
  21: 'mdi:wikipedia',

  // 22: Money/Dollar
  22: 'mdi:currency-usd',

  // 23: Certificate/Diploma
  23: 'mdi:certificate-outline',

  // 24: Mobile phone
  24: 'mdi:cellphone',

  // 25: Hard disk
  25: 'mdi:harddisk',

  // 26: Drive/Storage
  26: 'mdi:harddisk',

  // 27: Camera
  27: 'mdi:camera-outline',

  // 28: Flash/Lightning
  28: 'mdi:flash-outline',

  // 29: Mail/Email
  29: 'mdi:email-outline',

  // 30: Misc/Settings
  30: 'mdi:cog-outline',

  // 31: Calendar/Organizer
  31: 'mdi:calendar-outline',

  // 32: Code/ASCII
  32: 'mdi:code-tags',

  // 33: Star
  33: 'mdi:star-outline',

  // 34: Pencil/Edit
  34: 'mdi:pencil-outline',

  // 35: Trash/Delete
  35: 'mdi:trash-can-outline',

  // 36: Note/Sticky
  36: 'mdi:note-outline',

  // 37: Bell/Notification
  37: 'mdi:bell-outline',

  // 38: Trash can
  38: 'mdi:trash-can-outline',

  // 39: Folder blue
  39: 'mdi:folder',

  // 40: Folder open
  40: 'mdi:folder-open-outline',

  // 41: Folder
  41: 'mdi:folder',

  // 42: Folder open
  42: 'mdi:folder-open-outline',

  // 43: Folder archive/zip
  43: 'mdi:folder-zip-outline',

  // 44: Unlocked/Open
  44: 'mdi:lock-open-outline',

  // 45: Locked/Encrypted
  45: 'mdi:lock-outline',

  // 46: Checkmark/Apply
  46: 'mdi:check',

  // 47: Pen/Signature
  47: 'mdi:pen',

  // 48: Images/Gallery
  48: 'mdi:image-multiple-outline',

  // 49: Book/Contacts
  49: 'mdi:book-outline',

  // 50: Text editor/Document
  50: 'mdi:file-document-edit-outline',

  // 51: Package/Box
  51: 'mdi:package-variant',

  // 52: Home folder
  52: 'mdi:home-outline',

  // 53: Linux/Tux
  53: 'mdi:penguin',

  // 54: Feather/Light
  54: 'mdi:feather',

  // 55: Apple
  55: 'mdi:apple',

  // 56: Wiki/Wikipedia
  56: 'mdi:wikipedia',

  // 57: Money/Cash
  57: 'mdi:cash',

  // 58: Certificate
  58: 'mdi:certificate-outline',

  // 59: Smartphone
  59: 'mdi:cellphone',

  // 60: Run/Execute
  60: 'mdi:run',

  // 61: Wrench/Tools
  61: 'mdi:wrench-outline',

  // 62: Web Browser
  62: 'mdi:web',

  // 63: Archive/Compressed
  63: 'mdi:archive-outline',

  // 64: Percentage/Discount
  64: 'mdi:percent-outline',

  // 65: Server off/Disconnect
  65: 'mdi:server-off',

  // 66: History/Clock
  66: 'mdi:history',

  // 67: Mail search/Find
  67: 'mdi:email-search-outline',

  // 68: Vector/Graphics
  68: 'mdi:vector-square',
};

/**
 * Get haex-pass icon name for a KeePass standard icon index
 */
export function getIconForKeePassIndex(iconIndex: number | null | undefined): string | null {
  if (iconIndex === null || iconIndex === undefined) return null;
  return KEEPASS_ICON_MAP[iconIndex] || null;
}
