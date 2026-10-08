/**
 * External Request Handlers for browser extension communication
 *
 * Handles requests from external clients (browser extensions, CLI, etc.)
 * via the haex-vault WebSocket bridge.
 */

import { HAEX_PASS_METHODS } from "~/api/external";
import { useItemRequestHandlers } from "./externalRequestHandlers/items";
import { usePasskeyRequestHandlers } from "./externalRequestHandlers/passkeys";
import { usePasswordConfigRequestHandlers } from "./externalRequestHandlers/passwordConfig";

export function useExternalRequestHandlers() {
  const haexVaultStore = useHaexVaultStore();
  const { handleGetItems, handleGetTotp, handleCreateItem, handleUpdateItem } =
    useItemRequestHandlers();
  const { handleGetPasswordConfig, handleGetPasswordPresets } =
    usePasswordConfigRequestHandlers();
  const { handlePasskeyCreate, handlePasskeyGet, handlePasskeyList } =
    usePasskeyRequestHandlers();

  /**
   * Register all external request handlers
   * Should be called once during app initialization
   */
  const registerHandlers = () => {
    const client = haexVaultStore.client;

    // Handler: get-items
    // Returns matching entries for a given URL and field names
    client.onExternalRequest(HAEX_PASS_METHODS.GET_ITEMS, async (request) => {
      return handleGetItems(request);
    });

    // Handler: get-totp
    // Returns TOTP code for a given entry
    client.onExternalRequest(HAEX_PASS_METHODS.GET_TOTP, async (request) => {
      return handleGetTotp(request);
    });

    // Handler: create-item
    // Creates new credentials from browser extension
    client.onExternalRequest(HAEX_PASS_METHODS.CREATE_ITEM, async (request) => {
      return handleCreateItem(request);
    });

    // Handler: update-item
    // Updates existing credentials from browser extension
    client.onExternalRequest(HAEX_PASS_METHODS.UPDATE_ITEM, async (request) => {
      return handleUpdateItem(request);
    });

    // Handler: get-password-config
    // Returns default password generator configuration
    client.onExternalRequest(HAEX_PASS_METHODS.GET_PASSWORD_CONFIG, async (request) => {
      return handleGetPasswordConfig(request);
    });

    // Handler: get-password-presets
    // Returns all password generator presets
    client.onExternalRequest(HAEX_PASS_METHODS.GET_PASSWORD_PRESETS, async (request) => {
      return handleGetPasswordPresets(request);
    });

    // Handler: passkey-create
    // Creates a new passkey (WebAuthn registration)
    client.onExternalRequest(HAEX_PASS_METHODS.PASSKEY_CREATE, async (request) => {
      return handlePasskeyCreate(request);
    });

    // Handler: passkey-get
    // Authenticates with a passkey (WebAuthn authentication)
    client.onExternalRequest(HAEX_PASS_METHODS.PASSKEY_GET, async (request) => {
      return handlePasskeyGet(request);
    });

    // Handler: passkey-list
    // Lists passkeys for a relying party
    client.onExternalRequest(HAEX_PASS_METHODS.PASSKEY_LIST, async (request) => {
      return handlePasskeyList(request);
    });

    console.log("[haex-pass] External request handlers registered");
  };

  return {
    registerHandlers,
  };
}
