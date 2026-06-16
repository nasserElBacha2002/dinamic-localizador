import { getGoogleMapsApiKey, getGoogleMapsMapId } from "./google-maps-config";

const BOOTSTRAP_SCRIPT_ID = "dinamic-google-maps-bootstrap";

export interface GoogleMapsLibraries {
  maps: google.maps.MapsLibrary;
  places: google.maps.PlacesLibrary;
  marker: google.maps.MarkerLibrary;
}

let bootstrapPromise: Promise<void> | null = null;
let librariesPromise: Promise<GoogleMapsLibraries> | null = null;

const ensureGoogleNamespace = (): void => {
  const globalWindow = window as typeof window & {
    google?: { maps?: { importLibrary?: typeof google.maps.importLibrary } };
  };

  if (!globalWindow.google) {
    globalWindow.google = {} as typeof google;
  }

  if (!globalWindow.google.maps) {
    globalWindow.google.maps = {} as typeof google.maps;
  }
};

const injectBootstrapScript = (apiKey: string): void => {
  if (document.getElementById(BOOTSTRAP_SCRIPT_ID)) {
    return;
  }

  ensureGoogleNamespace();

  const inlineScript = document.createElement("script");
  inlineScript.id = BOOTSTRAP_SCRIPT_ID;
  inlineScript.textContent = `(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=\`https://maps.googleapis.com/maps/api/js?\`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";a.async=true;a.defer=true;m.head.append(a)}));d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})(${JSON.stringify({ key: apiKey, v: "weekly", loading: "async" })});`;
  document.head.appendChild(inlineScript);
};

const ensureBootstrap = (apiKey: string): Promise<void> => {
  if (window.google?.maps?.importLibrary) {
    return Promise.resolve();
  }

  if (!bootstrapPromise) {
    bootstrapPromise = new Promise<void>((resolve, reject) => {
      try {
        injectBootstrapScript(apiKey);
        const checkReady = (): void => {
          if (window.google?.maps?.importLibrary) {
            resolve();
            return;
          }

          window.setTimeout(checkReady, 20);
        };

        checkReady();
      } catch (error) {
        bootstrapPromise = null;
        reject(error);
      }
    }).catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
};

export async function loadGoogleMapsLibraries(): Promise<GoogleMapsLibraries> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY_MISSING");
  }

  if (!getGoogleMapsMapId()) {
    throw new Error("MAP_ID_MISSING");
  }

  if (!librariesPromise) {
    librariesPromise = (async () => {
      await ensureBootstrap(apiKey);

      const [maps, places, marker] = await Promise.all([
        google.maps.importLibrary("maps"),
        google.maps.importLibrary("places"),
        google.maps.importLibrary("marker"),
      ]);

      return {
        maps: maps as google.maps.MapsLibrary,
        places: places as google.maps.PlacesLibrary,
        marker: marker as google.maps.MarkerLibrary,
      };
    })().catch((error) => {
      librariesPromise = null;
      throw error;
    });
  }

  return librariesPromise;
}

export function resetGoogleMapsLoaderForTests(): void {
  bootstrapPromise = null;
  librariesPromise = null;
  if (typeof document !== "undefined") {
    const existing = document.getElementById(BOOTSTRAP_SCRIPT_ID);
    existing?.parentNode?.removeChild(existing);
  }
}
