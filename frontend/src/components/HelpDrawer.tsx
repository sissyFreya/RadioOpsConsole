import * as React from 'react'
import { X, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { cn } from '../utils/cn'
import { Button } from './ui/button'
import { Input } from './ui/input'

// ── Types ─────────────────────────────────────────────────────────────────

type HelpItem = { q: string; a: React.ReactNode }
type HelpSection = { id: string; emoji: string; title: string; items: HelpItem[] }

// ── Documentation content ────────────────────────────────────────────────

const SECTIONS: HelpSection[] = [
  {
    id: 'architecture',
    emoji: '🏗️',
    title: 'Architecture',
    items: [
      {
        q: `Qu'est-ce que RadioOps ?`,
        a: (
          <>
            RadioOps est une console de gestion pour stations de radio web. Elle permet de surveiller
            les serveurs, contrôler les services, gérer les bibliothèques musicales, enregistrer des
            émissions en direct et publier des podcasts — depuis une seule interface web.
          </>
        ),
      },
      {
        q: `Comment les composants communiquent-ils ?`,
        a: (
          <div className="space-y-2">
            <div className="rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
              <div>Browser</div>
              <div className="ml-4">↓ HTTP/WS</div>
              <div>Frontend (React) — port 5173 dev / 80 Docker</div>
              <div className="ml-4">↓ proxy nginx / Vite</div>
              <div>Backend (FastAPI) — port 8081 host / 8000 container</div>
              <div className="ml-4">↓ HTTP vers l'agent</div>
              <div>Agent (Python) — port 9000 (interne)</div>
              <div className="ml-8">↓ systemd/docker</div>
              <div className="ml-8">Icecast — port 8000 interne / 8000 externe</div>
              <div className="ml-8">Liquidsoap — port 8001 ingest, 1234 telnet</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Le frontend ne contacte <strong>jamais</strong> l'agent directement. Toutes les commandes
              passent par le backend.
            </p>
          </div>
        ),
      },
      {
        q: `Qu'est-ce que le mode MOCK_MODE ?`,
        a: (
          <>
            Quand <code className="rounded bg-muted px-1 text-[11px]">MOCK_MODE=true</code> est activé
            sur le conteneur agent, celui-ci simule des réponses sans réellement contrôler Icecast ou
            Liquidsoap. Utile pour tester l'interface sans infrastructure radio. Désactivez-le en
            production.
          </>
        ),
      },
    ],
  },
  {
    id: 'nodes',
    emoji: '🖥️',
    title: 'Nœuds (Nodes)',
    items: [
      {
        q: `Qu'est-ce qu'un nœud ?`,
        a: (
          <>
            Un nœud est un serveur qui exécute l'<strong>agent RadioOps</strong>. L'agent expose une
            API HTTP locale (port 9000 par défaut) que le backend interroge pour obtenir l'état des
            services et y envoyer des commandes.
          </>
        ),
      },
      {
        q: `Quelle valeur mettre dans "Agent URL" ?`,
        a: (
          <div className="space-y-1.5">
            <p>L'URL doit être joignable depuis le <strong>backend</strong>, pas depuis le navigateur.</p>
            <ul className="ml-3 list-disc space-y-1 text-xs text-muted-foreground">
              <li>Docker Compose : <code className="rounded bg-muted px-1">http://agent:9000</code></li>
              <li>Réseau local : <code className="rounded bg-muted px-1">http://10.0.0.5:9000</code></li>
              <li>Distant (VPN) : <code className="rounded bg-muted px-1">https://node-paris.example.com:9000</code></li>
            </ul>
          </div>
        ),
      },
      {
        q: `Un nœud est "Unreachable" — pourquoi ?`,
        a: (
          <ul className="ml-3 list-disc space-y-1 text-xs">
            <li>Le conteneur/service agent n'est pas démarré</li>
            <li>L'URL enregistrée est incorrecte ou inaccessible depuis le réseau backend</li>
            <li>Un firewall bloque le port 9000</li>
            <li>Le backend n'est pas sur le même réseau Docker que l'agent</li>
          </ul>
        ),
      },
      {
        q: `Que signifie "Degraded" sur un nœud ?`,
        a: (
          <>
            L'agent répond mais au moins un des services déclarés (icecast, liquidsoap…) est inactif.
            Vérifiez l'onglet Services du nœud pour identifier lequel est en panne.
          </>
        ),
      },
    ],
  },
  {
    id: 'radios',
    emoji: '📻',
    title: 'Radios & Streams',
    items: [
      {
        q: `Qu'est-ce qu'une Radio ?`,
        a: (
          <>
            Une Radio est une configuration de stream associée à un nœud. Elle définit les points de
            montage Icecast, les URLs publiques/internes, et les labels des services. Un nœud peut héberger
            plusieurs radios.
          </>
        ),
      },
      {
        q: `Quelle différence entre "Public base URL" et "Internal base URL" ?`,
        a: (
          <div className="space-y-2">
            <div>
              <strong>Public base URL</strong> — URL qu'utilisent les auditeurs pour écouter le stream.
              Exemple : <code className="rounded bg-muted px-1 text-[11px]">http://radio.example.com:8000</code>
            </div>
            <div>
              <strong>Internal base URL</strong> — URL utilisée par le backend pour communiquer avec
              Icecast en interne (stats, enregistrement). En Docker, utiliser le nom du service :
              <code className="ml-1 rounded bg-muted px-1 text-[11px]">http://icecast:8000</code>
            </div>
          </div>
        ),
      },
      {
        q: `Qu'est-ce qu'un "Mount" (point de montage) ?`,
        a: (
          <>
            Le mount est le chemin du stream Icecast. Par exemple avec le mount{' '}
            <code className="rounded bg-muted px-1 text-[11px]">/stream</code>, les auditeurs se connectent à{' '}
            <code className="rounded bg-muted px-1 text-[11px]">http://radio.example.com:8000/stream</code>.
            Liquidsoap doit être configuré pour streamer vers le même mount.
          </>
        ),
      },
      {
        q: `Pourquoi le stream donne "404 file not found" ?`,
        a: (
          <ul className="ml-3 list-disc space-y-1 text-xs">
            <li>Aucune source (Liquidsoap) n'est connectée à ce mount</li>
            <li>
              Le mount configuré dans l'UI (<code className="rounded bg-muted px-1">/test</code>) ne
              correspond pas au mount hardcodé dans Liquidsoap (<code className="rounded bg-muted px-1">/stream</code>)
            </li>
            <li>Liquidsoap n'est pas démarré ou a crashé</li>
            <li>Icecast n'est pas joignable sur le port 8000</li>
          </ul>
        ),
      },
      {
        q: `Que sont "Icecast service label" et "Liquidsoap service label" ?`,
        a: (
          <>
            Ce sont les noms exacts des services tels que rapportés par l'agent. Si l'agent retourne{' '}
            <code className="rounded bg-muted px-1 text-[11px]">icecast</code> et{' '}
            <code className="rounded bg-muted px-1 text-[11px]">liquidsoap</code>, saisissez ces valeurs.
            Une incohérence entraîne un faux statut "Degraded". En Docker Compose avec l'agent mock,
            les noms sont <code className="rounded bg-muted px-1 text-[11px]">icecast</code> et{' '}
            <code className="rounded bg-muted px-1 text-[11px]">liquidsoap</code>.
          </>
        ),
      },
    ],
  },
  {
    id: 'autodj',
    emoji: '🎵',
    title: 'AutoDJ & Bibliothèque',
    items: [
      {
        q: `Comment fonctionne l'AutoDJ ?`,
        a: (
          <>
            Liquidsoap lit en continu les fichiers audio du dossier{' '}
            <code className="rounded bg-muted px-1 text-[11px]">/data/radios/radio_N/tracks/</code> (N = ID du radio).
            La playlist est rechargée toutes les ~10 secondes. Si le dossier est vide, Liquidsoap émet du silence.
          </>
        ),
      },
      {
        q: `Quels formats audio puis-je uploader ?`,
        a: (
          <>
            MP3, WAV, FLAC, OGG, AAC, M4A, OPUS. Taille maximum : <strong>500 MB</strong> par fichier.
            Liquidsoap encode en MP3 128 kbps avant de streamer vers Icecast.
          </>
        ),
      },
      {
        q: `Mon fichier uploadé n'est pas joué immédiatement`,
        a: (
          <>
            Liquidsoap recharge la playlist toutes les 10 secondes. Attendez quelques secondes ou
            redémarrez le service depuis "Service controls". Si le fichier est corrompu ou mal encodé,
            Liquidsoap peut l'ignorer silencieusement.
          </>
        ),
      },
      {
        q: `La variable RADIO_ID dans docker-compose est importante`,
        a: (
          <>
            Le conteneur Liquidsoap utilise{' '}
            <code className="rounded bg-muted px-1 text-[11px]">RADIO_ID</code> pour savoir quel
            dossier de tracks lire. Si votre radio a l'ID 2, définissez{' '}
            <code className="rounded bg-muted px-1 text-[11px]">RADIO_ID=2</code> dans l'environnement
            Liquidsoap. Par défaut, c'est 1.
          </>
        ),
      },
    ],
  },
  {
    id: 'live',
    emoji: '🎙️',
    title: 'Enregistrement Live',
    items: [
      {
        q: `Qu'est-ce que l'enregistrement live ?`,
        a: (
          <>
            Le backend demande à l'agent de lancer ffmpeg pour enregistrer le stream Icecast. L'audio
            est sauvegardé en MP3 dans{' '}
            <code className="rounded bg-muted px-1 text-[11px]">/data/podcasts/show_N/live_XXX.mp3</code>.
            À l'arrêt, un épisode de podcast est créé automatiquement.
          </>
        ),
      },
      {
        q: `Comment démarrer un enregistrement ?`,
        a: (
          <ol className="ml-3 list-decimal space-y-1 text-xs">
            <li>Aller sur la page de la radio → onglet "Live record"</li>
            <li>Choisir le show de podcast cible</li>
            <li>Sélectionner le mount à enregistrer</li>
            <li>Saisir un titre</li>
            <li>Cliquer "Start live recording"</li>
          </ol>
        ),
      },
      {
        q: `L'enregistrement échoue avec une erreur 502`,
        a: (
          <ul className="ml-3 list-disc space-y-1 text-xs">
            <li>L'agent est injoignable ou pas démarré</li>
            <li>Le stream Icecast est vide (aucune source connectée)</li>
            <li>ffmpeg n'est pas installé dans le conteneur agent</li>
            <li>L'espace disque est insuffisant sur le volume media</li>
          </ul>
        ),
      },
    ],
  },
  {
    id: 'onair',
    emoji: '🔴',
    title: 'On Air / DJ Takeover',
    items: [
      {
        q: `Comment fonctionne le DJ Takeover ?`,
        a: (
          <div className="space-y-2 text-xs">
            <p>AutoDJ tourne 24/7. Le takeover permet au DJ de prendre l'antenne sans couper le stream :</p>
            <ol className="ml-3 list-decimal space-y-1">
              <li>Connectez votre PC au <strong>harbor Liquidsoap</strong> (port 8001) avec BUTT, OBS, ou un client Icecast</li>
              <li>La connexion seule ne coupe pas l'AutoDJ</li>
              <li>Activez "Enable takeover" depuis l'interface → votre audio remplace l'AutoDJ</li>
              <li>Désactivez takeover pour revenir à l'AutoDJ</li>
            </ol>
          </div>
        ),
      },
      {
        q: `Paramètres de connexion pour BUTT / OBS`,
        a: (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">
              Ces paramètres sont affichés dans l'onglet "On air" de chaque radio.
            </p>
            <div className="rounded-lg bg-muted/40 p-3 font-mono text-[11px] space-y-1">
              <div>Protocole : <strong>Icecast</strong></div>
              <div>Hôte : <em>host de votre serveur</em></div>
              <div>Port : <strong>8001</strong></div>
              <div>Mount : <strong>/live</strong></div>
              <div>Mot de passe : <em>voir LIVE_INGEST_PASSWORD_HINT</em></div>
            </div>
            <p className="text-xs text-destructive mt-2">
              ⚠️ Ne vous connectez pas sur /stream — vous déconnecteriez l'AutoDJ.
            </p>
          </div>
        ),
      },
      {
        q: `"PC connected" reste à off bien que connecté`,
        a: (
          <>
            Liquidsoap détecte la connexion via le telnet interne (port 1234). Vérifiez que
            l'agent peut atteindre Liquidsoap sur ce port. En Docker, les deux doivent être sur le
            même réseau. Le statut se met à jour toutes les 2 secondes.
          </>
        ),
      },
    ],
  },
  {
    id: 'podcasts',
    emoji: '🎧',
    title: 'Podcasts',
    items: [
      {
        q: `Structure Shows / Épisodes`,
        a: (
          <>
            Un <strong>Show</strong> est une émission (ex. "Matinale du Lundi"). Il peut contenir
            plusieurs <strong>Épisodes</strong>. Les épisodes peuvent être uploadés manuellement ou
            créés automatiquement depuis un enregistrement live.
          </>
        ),
      },
      {
        q: `Comment accéder au flux RSS ?`,
        a: (
          <>
            Chaque show dispose d'un flux RSS à l'adresse{' '}
            <code className="rounded bg-muted px-1 text-[11px]">/podcasts/shows/{'{id}'}/rss</code>.
            Ce flux est compatible avec les agrégateurs de podcasts standard (Apple Podcasts,
            Spotify via RSS, Pocket Casts…).
          </>
        ),
      },
      {
        q: `Les fichiers audio sont-ils streamés ou téléchargés ?`,
        a: (
          <>
            En mode local (sans S3), les fichiers sont servis par le backend depuis le volume{' '}
            <code className="rounded bg-muted px-1 text-[11px]">/data</code>. En mode S3/MinIO,
            des URLs pré-signées sont générées avec une durée de validité configurable (défaut 1h).
          </>
        ),
      },
    ],
  },
  {
    id: 'users',
    emoji: '👥',
    title: 'Utilisateurs & Rôles',
    items: [
      {
        q: `Quels sont les rôles disponibles ?`,
        a: (
          <div className="space-y-2">
            <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
              <div>
                <strong>admin</strong> — accès complet : gestion des utilisateurs, suppression,
                configuration de la plateforme
              </div>
              <div>
                <strong>ops</strong> — peut contrôler les radios, lancer des actions, démarrer
                des enregistrements, uploader des tracks. Ne peut pas gérer les utilisateurs.
              </div>
              <div>
                <strong>viewer</strong> — lecture seule : peut voir l'état des services et écouter
                les streams mais ne peut rien modifier.
              </div>
            </div>
          </div>
        ),
      },
      {
        q: `Comment créer le premier compte admin ?`,
        a: (
          <>
            Le compte admin est créé automatiquement au démarrage du backend via les variables d'environnement{' '}
            <code className="rounded bg-muted px-1 text-[11px]">BOOTSTRAP_ADMIN_EMAIL</code> et{' '}
            <code className="rounded bg-muted px-1 text-[11px]">BOOTSTRAP_ADMIN_PASSWORD</code>.
            Par défaut : <code className="rounded bg-muted px-1 text-[11px]">admin@local</code> /
            <code className="ml-1 rounded bg-muted px-1 text-[11px]">admin</code>. Changez-le immédiatement en production.
          </>
        ),
      },
      {
        q: `Comment changer son mot de passe ?`,
        a: (
          <>
            Dans la barre latérale, cliquez sur "Password" en bas. Vous pouvez aussi utiliser
            l'API directement : <code className="rounded bg-muted px-1 text-[11px]">POST /auth/change-password</code>.
          </>
        ),
      },
    ],
  },
  {
    id: 'audit',
    emoji: '📋',
    title: 'Audit & Actions',
    items: [
      {
        q: `Qu'est-ce qu'une Action ?`,
        a: (
          <>
            Une Action est une commande envoyée à l'agent : <code className="rounded bg-muted px-1 text-[11px]">restart</code> ou{' '}
            <code className="rounded bg-muted px-1 text-[11px]">reload</code> d'un service. Toutes les actions
            sont enregistrées avec l'auteur, la date, et le résultat. On peut aussi lancer des
            actions en masse (Bulk actions) depuis la page Nodes.
          </>
        ),
      },
      {
        q: `Quelle différence entre Restart et Reload ?`,
        a: (
          <div className="space-y-2 text-xs">
            <div>
              <strong>Restart</strong> — arrête puis redémarre complètement le service. Coupe
              brièvement le stream. À utiliser pour appliquer un changement de config majeur.
            </div>
            <div>
              <strong>Reload</strong> — demande au service de relire sa configuration sans s'arrêter.
              Liquidsoap supporte reload (rechargement de la playlist). Certains services l'ignorent.
            </div>
          </div>
        ),
      },
      {
        q: `Qu'est-ce que l'Audit Log ?`,
        a: (
          <>
            L'audit log trace toutes les opérations significatives : connexions, modifications de
            config, démarrage/arrêt d'enregistrements, actions de service… Les événements sont
            conservés 90 jours par défaut (configurable via{' '}
            <code className="rounded bg-muted px-1 text-[11px]">AUDIT_RETAIN_DAYS</code>). Exportable en CSV.
          </>
        ),
      },
    ],
  },
  {
    id: 'troubleshooting',
    emoji: '🔧',
    title: 'Dépannage',
    items: [
      {
        q: `CORS errors dans la console`,
        a: (
          <div className="space-y-2 text-xs">
            <p>
              <strong>En dev (npm run dev)</strong> : vérifiez que le Vite proxy est configuré dans{' '}
              <code className="rounded bg-muted px-1">vite.config.ts</code> et que le backend tourne
              sur le port 8081.
            </p>
            <p>
              <strong>En Docker</strong> : le frontend nginx doit proxy les requêtes API vers le
              backend. Assurez-vous que <code className="rounded bg-muted px-1">VITE_API_BASE</code>{' '}
              est vide (URLs relatives) et que <code className="rounded bg-muted px-1">nginx.conf</code>
              contient les <code className="rounded bg-muted px-1">proxy_pass</code> vers{' '}
              <code className="rounded bg-muted px-1">http://backend:8000</code>.
            </p>
          </div>
        ),
      },
      {
        q: `413 lors de l'upload de tracks`,
        a: (
          <>
            nginx limite la taille des requêtes à 1 MB par défaut. Le{' '}
            <code className="rounded bg-muted px-1 text-[11px]">nginx.conf</code> doit contenir{' '}
            <code className="rounded bg-muted px-1 text-[11px]">client_max_body_size 500m;</code>.
            Le backend accepte jusqu'à 500 MB.
          </>
        ),
      },
      {
        q: `500 sur /live/active`,
        a: (
          <>
            La table <code className="rounded bg-muted px-1 text-[11px]">live_sessions</code> en base
            de données n'a pas le bon schéma. Relancez le backend pour que les migrations Alembic
            s'appliquent, ou exécutez{' '}
            <code className="rounded bg-muted px-1 text-[11px]">alembic upgrade head</code>.
          </>
        ),
      },
      {
        q: `Les logs WebSocket ne se connectent pas`,
        a: (
          <ul className="ml-3 list-disc space-y-1 text-xs">
            <li>Le ticket WS expire en 30 secondes — le composant en obtient un automatiquement</li>
            <li>Vérifiez que le proxy WebSocket est configuré (<code className="rounded bg-muted px-1">ws: true</code> dans Vite, headers Upgrade dans nginx)</li>
            <li>L'agent doit supporter <code className="rounded bg-muted px-1">GET /logs/tail?service=X</code></li>
          </ul>
        ),
      },
      {
        q: `Le radio est "Degraded" malgré des services actifs`,
        a: (
          <>
            Le label de service configuré (ex. <code className="rounded bg-muted px-1 text-[11px]">icecast2</code>) ne
            correspond pas au nom retourné par l'agent (ex. <code className="rounded bg-muted px-1 text-[11px]">icecast</code>).
            Corrigez les champs "Icecast service label" et "Liquidsoap service label" dans les paramètres
            du radio pour qu'ils correspondent exactement aux noms rapportés dans la section Services.
          </>
        ),
      },
    ],
  },
  {
    id: 'shortcuts',
    emoji: '⌨️',
    title: 'Raccourcis clavier',
    items: [
      {
        q: `Commande Palette`,
        a: (
          <div className="space-y-2">
            <div className="rounded-lg border border-border p-3 font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Ouvrir la palette</span>
                <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-[10px]">⌘K / Ctrl+K</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Naviguer</span>
                <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-[10px]">↑ ↓</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Sélectionner</span>
                <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-[10px]">↵ Enter</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Fermer</span>
                <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-[10px]">Esc</kbd>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              La palette permet de naviguer vers les pages, les radios et les nœuds enregistrés.
            </p>
          </div>
        ),
      },
      {
        q: `Aide contextuelle`,
        a: (
          <>
            Les icônes <strong>?</strong> à côté des champs affichent une explication en survol.
            Cliquer sur "Help" dans la barre latérale ouvre ce panneau de documentation.
          </>
        ),
      },
    ],
  },
]

// ── Section accordion item ────────────────────────────────────────────────

function SectionBlock({
  section,
  defaultOpen,
  searchQuery,
}: {
  section: HelpSection
  defaultOpen: boolean
  searchQuery: string
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  const visibleItems = searchQuery
    ? section.items.filter(
        (item) =>
          item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (typeof item.a === 'string' &&
            item.a.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : section.items

  if (searchQuery && visibleItems.length === 0) return null

  return (
    <div className="border border-border rounded-2xl overflow-hidden">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">{section.emoji}</span>
          <span className="text-sm font-semibold text-foreground">{section.title}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {visibleItems.length}
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-border border-t border-border">
          {visibleItems.map((item, i) => (
            <div key={i} className="px-4 py-3 space-y-1.5">
              <div className="text-xs font-semibold text-foreground">{item.q}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{item.a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────

export function HelpDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Esc
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const hasQuery = query.trim().length > 0

  const matchingCount = SECTIONS.reduce((acc, s) => {
    return (
      acc +
      s.items.filter(
        (item) =>
          !hasQuery || item.q.toLowerCase().includes(query.toLowerCase())
      ).length
    )
  }, 0)

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-[540px] flex-col bg-background border-l border-border shadow-2xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <div className="text-base font-semibold">Documentation RadioOps</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {SECTIONS.length} sections · {SECTIONS.reduce((a, s) => a + s.items.length, 0)} réponses
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          {hasQuery && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {matchingCount} résultat{matchingCount !== 1 ? 's' : ''} pour « {query} »
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {SECTIONS.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              defaultOpen={hasQuery}
              searchQuery={query}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-5 py-3 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Appuyez sur <kbd className="rounded border border-border bg-muted px-1">Esc</kbd> pour fermer</span>
          <span>RadioOps v0.3</span>
        </div>
      </div>
    </>
  )
}
