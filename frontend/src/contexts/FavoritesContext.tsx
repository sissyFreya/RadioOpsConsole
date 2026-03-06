import * as React from 'react'

export type FavoriteType = 'radio' | 'node'

export type Favorite = {
  type: FavoriteType
  id: number
  name: string
  addedAt: string
}

type FavoritesCtx = {
  favorites: Favorite[]
  isFavorite: (type: FavoriteType, id: number) => boolean
  toggle: (type: FavoriteType, id: number, name: string) => void
  remove: (type: FavoriteType, id: number) => void
  radios: Favorite[]
  nodes: Favorite[]
}

const FavoritesContext = React.createContext<FavoritesCtx>({
  favorites: [],
  isFavorite: () => false,
  toggle: () => {},
  remove: () => {},
  radios: [],
  nodes: [],
})

const STORAGE_KEY = 'radioops_favorites'

function load(): Favorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Favorite[]
  } catch {
    return []
  }
}

function save(favorites: Favorite[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites))
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = React.useState<Favorite[]>(load)

  const isFavorite = React.useCallback(
    (type: FavoriteType, id: number) =>
      favorites.some((f) => f.type === type && f.id === id),
    [favorites]
  )

  const toggle = React.useCallback(
    (type: FavoriteType, id: number, name: string) => {
      setFavorites((prev) => {
        const exists = prev.some((f) => f.type === type && f.id === id)
        const next = exists
          ? prev.filter((f) => !(f.type === type && f.id === id))
          : [...prev, { type, id, name, addedAt: new Date().toISOString() }]
        save(next)
        return next
      })
    },
    []
  )

  const remove = React.useCallback((type: FavoriteType, id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => !(f.type === type && f.id === id))
      save(next)
      return next
    })
  }, [])

  const radios = favorites.filter((f) => f.type === 'radio')
  const nodes = favorites.filter((f) => f.type === 'node')

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggle, remove, radios, nodes }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  return React.useContext(FavoritesContext)
}
