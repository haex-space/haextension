#!/usr/bin/env bash
# Builds Crispy DOOM to WebAssembly for haex-doom (research R-1, R-2) and fetches the bundled
# game data. The engine build runs in a pinned Emscripten container and is skipped when the
# stamp over everything that feeds it is unchanged.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="$APP_DIR/engine"
SOURCE_DIR="$ENGINE_DIR/.build/crispy-doom"
OUT_DIR="$APP_DIR/public/engine"

UPSTREAM_URL="https://github.com/fabiangreffrath/crispy-doom.git"
UPSTREAM_SHA="fdeabe4c23a833534b70aa84a22f1685aae7125d" # tag crispy-doom-7.2
EMSDK_IMAGE="emscripten/emsdk:6.0.12@sha256:77638e6c215a65f25a704c0c831d5c2463a8c0468a58c6cb82489dbe621dfa05"
EXPORTS="_main,_haex_post_event,_haex_set_mouse_motion,_haex_set_paused,_haex_net_peer_closed,_haex_debug_game,_haex_debug_player"
# ponytail: the engine calls state actions such as A_Look(mobj_t *) through a three-argument
# pointer, which WebAssembly traps on; EMULATE_FUNCTION_POINTER_CASTS makes every indirect call
# a little slower. Upgrade path: patch the action prototypes in src/doom to one signature.
# EXIT_RUNTIME lets exit() from the engine's Quit reach Module.onExit, so the shell returns to
# the start screen.
LINK_FLAGS="-O3 -sEMULATE_FUNCTION_POINTER_CASTS=1 -sEXIT_RUNTIME=1 -sMODULARIZE=1 -sEXPORT_ES6=1 \
-sEXPORT_NAME=createCrispyDoom -sINVOKE_RUN=0 -sENVIRONMENT=web \
-sEXPORTED_RUNTIME_METHODS=FS,callMain,cwrap -sEXPORTED_FUNCTIONS=$EXPORTS"

stamp() {
  {
    echo "$UPSTREAM_SHA $EMSDK_IMAGE $LINK_FLAGS"
    cat "${BASH_SOURCE[0]}"
    (cd "$ENGINE_DIR" && find patches src config -type f -print0 | sort -z | xargs -0 sha256sum)
  } | sha256sum | cut -d' ' -f1
}

build_engine() {
  if [[ ! -d "$SOURCE_DIR/.git" ]]; then
    git clone --quiet --no-checkout "$UPSTREAM_URL" "$SOURCE_DIR"
  fi
  if ! git -C "$SOURCE_DIR" cat-file -e "$UPSTREAM_SHA^{commit}" 2>/dev/null; then
    git -C "$SOURCE_DIR" fetch --quiet origin "$UPSTREAM_SHA"
  fi
  # Keep the CMake build directory and the Emscripten port cache between builds.
  git -C "$SOURCE_DIR" checkout --quiet --force "$UPSTREAM_SHA"
  git -C "$SOURCE_DIR" clean --quiet -fdx -e build-wasm -e .emcache
  for patch in "$ENGINE_DIR"/patches/*.patch; do
    git -C "$SOURCE_DIR" apply "$patch"
  done
  cp "$ENGINE_DIR"/src/*.[ch] "$SOURCE_DIR/src/"

  docker run --rm \
    --user "$(id -u):$(id -g)" \
    --env HOME=/tmp \
    --env EM_CACHE=/src/.emcache \
    --env HAEX_LINK_FLAGS="$LINK_FLAGS" \
    --volume "$SOURCE_DIR:/src" \
    --workdir /src \
    "$EMSDK_IMAGE" \
    sh -c 'emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release \
             -DENABLE_SDL2_NET=OFF -DENABLE_SDL2_MIXER=ON "-DHAEX_LINK_FLAGS=$HAEX_LINK_FLAGS" \
           && cmake --build build-wasm --target crispy-doom --parallel'

  mkdir -p "$OUT_DIR/config"
  cp "$SOURCE_DIR/build-wasm/src/crispy-doom.js" "$SOURCE_DIR/build-wasm/src/crispy-doom.wasm" "$OUT_DIR/"
  cp "$ENGINE_DIR"/config/*.cfg "$OUT_DIR/config/"
}

current="$(stamp)"
if [[ -f "$OUT_DIR/.stamp" && "$(cat "$OUT_DIR/.stamp")" == "$current" ]]; then
  echo "engine: up to date"
else
  build_engine
  echo "$current" > "$OUT_DIR/.stamp"
fi

bash "$ENGINE_DIR/fetch-data.sh"
