import { getTableName } from "@haex-space/vault-sdk";
import manifest from "../../haextension/manifest.json";
import packageJson from "../../package.json";

/** Voll qualifizierte Tabellennamen, wie die Spaces-API des Hosts sie erwartet. */
export const FULL_NOTEBOOKS_TABLE = getTableName(manifest.publicKey, packageJson.name, "notebooks");
export const FULL_PAGES_TABLE = getTableName(manifest.publicKey, packageJson.name, "pages");
export const FULL_ASSETS_TABLE = getTableName(manifest.publicKey, packageJson.name, "assets");
