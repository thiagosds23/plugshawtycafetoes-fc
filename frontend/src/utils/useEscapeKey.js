import { useEffect, useRef } from 'react';

/**
 * Chama `onEscape` quando o usuário aperta Esc, enquanto `ativo` for verdadeiro.
 * Usado pelos modais para fecharem pelo teclado.
 *
 *   useEscapeKey(onClose, isOpen);
 */
export function useEscapeKey(onEscape, ativo = true) {
  // Guarda a função mais recente sem recriar o listener a cada render
  const callback = useRef(onEscape);
  useEffect(() => { callback.current = onEscape; }, [onEscape]);

  useEffect(() => {
    if (!ativo) return undefined;
    const aoTeclar = (e) => {
      if (e.key === 'Escape' && callback.current) callback.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo]);
}
