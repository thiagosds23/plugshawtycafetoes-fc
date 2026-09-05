/**
 * Espera todas as imagens de um nó terminarem de carregar antes de exportá-lo em PNG.
 *
 * As fotos dos atletas agora chegam por URL (`/users/:id/photo`) em vez de embutidas
 * em Base64 no JSON. Isso deixa as telas muito mais leves, mas significa que uma foto
 * ainda em carregamento sairia como um espaço em branco na arte da escalação.
 */
export async function waitForImages(node, timeoutMs = 6000) {
  if (!node) return;
  const images = Array.from(node.querySelectorAll('img'));

  await Promise.all(images.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      // Uma foto que falhe não pode travar a exportação inteira
      const timer = setTimeout(done, timeoutMs);
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }));
}
