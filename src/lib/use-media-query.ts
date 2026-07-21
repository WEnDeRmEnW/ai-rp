import { useEffect, useState } from 'react'

const supportsMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

// Reactive media query hook: unlike reading window.innerWidth during render,
// this re-renders when the viewport crosses the breakpoint (resize, rotation, split screen).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => supportsMatchMedia() && window.matchMedia(query).matches)

  useEffect(() => {
    if (!supportsMatchMedia()) return
    const mediaQueryList = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mediaQueryList.matches)
    mediaQueryList.addEventListener('change', onChange)
    return () => mediaQueryList.removeEventListener('change', onChange)
  }, [query])

  return matches
}
