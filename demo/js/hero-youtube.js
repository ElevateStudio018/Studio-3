// Hero-montage av riktiga avsnitt via YouTubes officiella IFrame-spelare.
// Två spelare turas om: medan den ena visar ett klipp laddas och pausas nästa
// klipp i den andra, så att klippen byts utan laddningspaus.

let apiPromise;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube kunde inte laddas'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('YouTube svarade inte')), 9000);
  });
  return apiPromise;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.container  element som spelarna läggs i
 * @param {{id:string,start:number,len:number,title?:string}[]} o.clips
 * @param {(clip, index:number, loop:number) => void} [o.onCut]  anropas när ett nytt klipp syns
 * @param {() => void} [o.onFail]  anropas om YouTube inte går att spela – visa MP4 i stället
 */
export function youtubeHero({ container, clips, onCut, onFail }) {
  let players = [];
  let active = 0;
  let index = 0;
  let loop = 0;
  let timer = null;
  let started = false;
  let failed = false;
  let paused = false;
  let muted = true;
  let waitedFor = 0;
  let readyPlayers = 0;
  const ready = [false, false];
  const slotClip = [null, null];

  const fail = (why) => {
    if (failed || started) return;
    failed = true;
    stop();
    container.innerHTML = '';
    onFail?.(why);
  };

  const prepare = (slot, clip) => {
    ready[slot] = false;
    slotClip[slot] = clip;
    players[slot].mute();
    players[slot].loadVideoById({ videoId: clip.id, startSeconds: clip.start });
  };

  const show = (slot) => {
    const p = players[slot];
    if (!muted) p.unMute();
    p.playVideo();
    container.dataset.active = slot;
    active = slot;
    onCut?.(slotClip[slot], index % clips.length, loop);
  };

  const tick = () => {
    if (paused) return;
    const p = players[active];
    const clip = slotClip[active];
    if (!p?.getCurrentTime || !clip) return;
    if (p.getCurrentTime() < clip.start + clip.len) return;
    const next = 1 - active;
    if (!ready[next]) {
      // Nästa klipp är inte buffrat än – låt nuvarande rulla vidare en stund, hoppa annars över
      waitedFor += 0.1;
      if (waitedFor > 3) {
        index++;
        prepare(next, clips[(index + 1) % clips.length]);
        waitedFor = 0;
      }
      return;
    }
    waitedFor = 0;
    players[active].pauseVideo();
    players[active].mute();
    index++;
    if (index % clips.length === 0) loop++;
    show(next);
    prepare(1 - next, clips[(index + 1) % clips.length]);
  };

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  container.innerHTML = '<div class="yt-slot" data-slot="0"><div></div></div><div class="yt-slot" data-slot="1"><div></div></div>';
  const failTimer = setTimeout(() => fail('timeout'), 12000);

  loadApi().then((YT) => {
    if (failed) return;
    const make = (slot) => new YT.Player(container.querySelector(`[data-slot="${slot}"] > div`), {
      host: 'https://www.youtube-nocookie.com',
      width: '1600',
      height: '900',
      playerVars: { autoplay: 0, mute: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => {
          players[slot].getIframe().setAttribute('tabindex', '-1');
          players[slot].getIframe().setAttribute('aria-hidden', 'true');
          readyPlayers++;
          if (readyPlayers === 2) {
            prepare(0, clips[0]);
            prepare(1, clips[1 % clips.length]);
          }
        },
        onStateChange: (e) => {
          if (e.data !== YT.PlayerState.PLAYING) return;
          if (!ready[slot]) {
            ready[slot] = true;
            if (!started && slot === 0) {
              // Första klippet: börja visa direkt
              started = true;
              clearTimeout(failTimer);
              show(0);
              timer = setInterval(tick, 100);
            } else if (slot !== active || !started) {
              e.target.pauseVideo();
              e.target.seekTo(slotClip[slot].start, true);
            }
          }
        },
        onError: () => {
          if (!started && slot === 0) return fail('error');
          // Klippet går inte att spela inbäddat – hoppa till nästa
          index++;
          prepare(slot, clips[(index + 1) % clips.length]);
        },
      },
    });
    players = [make(0), make(1)];
  }).catch(() => fail('api'));

  return {
    pause() {
      paused = true;
      players[active]?.pauseVideo?.();
    },
    play() {
      paused = false;
      players[active]?.playVideo?.();
    },
    restart() {
      if (!started) return;
      index = 0;
      loop = 0;
      players[1 - active].pauseVideo();
      slotClip[1 - active] = null;
      prepare(active, clips[0]);
      ready[active] = true;
      onCut?.(clips[0], 0, 0);
      prepare(1 - active, clips[1 % clips.length]);
    },
    setMuted(m) {
      muted = m;
      if (m) players.forEach((p) => p?.mute?.());
      else players[active]?.unMute?.();
    },
    get started() {
      return started;
    },
  };
}
