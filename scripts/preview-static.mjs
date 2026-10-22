import { createReadStream, existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const publicDirectory = path.resolve(process.cwd(), '.output/public');

if (!existsSync(publicDirectory)) {
  console.error('Build estático não encontrado em .output/public. Execute npm run generate primeiro.');
  process.exit(1);
}

const publicRoot = await realpath(publicDirectory);
const host = process.env.NUXT_STATIC_PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.NUXT_STATIC_PREVIEW_PORT || 4173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('NUXT_STATIC_PREVIEW_PORT precisa ser uma porta entre 1 e 65535.');
  process.exit(1);
}

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function isInsidePublicRoot(filePath) {
  const relative = path.relative(publicRoot, filePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolvePublicFile(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname).replaceAll('\\', '/');
  } catch {
    return { status: 400 };
  }

  if (decodedPath.includes('\0')) return { status: 400 };

  const candidate = path.resolve(publicRoot, `.${decodedPath}`);
  if (!isInsidePublicRoot(candidate)) return { status: 403 };

  const candidates = [candidate];
  if (!path.extname(candidate)) candidates.push(path.join(candidate, 'index.html'));

  for (const filePath of candidates) {
    try {
      const actualPath = await realpath(filePath);
      if (!isInsidePublicRoot(actualPath)) return { status: 403 };

      const fileInfo = await stat(actualPath);
      if (fileInfo.isFile()) return { filePath: actualPath, fileInfo, status: 200 };
      if (fileInfo.isDirectory()) {
        const indexPath = await realpath(path.join(actualPath, 'index.html'));
        if (!isInsidePublicRoot(indexPath)) return { status: 403 };
        const indexInfo = await stat(indexPath);
        if (indexInfo.isFile()) return { filePath: indexPath, fileInfo: indexInfo, status: 200 };
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }

  const notFoundPage = path.join(publicRoot, '404.html');
  try {
    const fileInfo = await stat(notFoundPage);
    if (fileInfo.isFile()) return { filePath: notFoundPage, fileInfo, status: 404 };
  } catch {
    // Return a short plain-text 404 when the static build has no custom page.
  }

  return { status: 404 };
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Método não permitido.');
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url || '/', 'http://localhost').pathname;
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('URL inválida.');
    return;
  }

  let result;
  try {
    result = await resolvePublicFile(pathname);
  } catch (error) {
    console.error(`Falha ao ler ${pathname}:`, error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Erro ao ler o arquivo estático.');
    return;
  }

  if (!result.filePath) {
    const body = result.status === 404 ? 'Página não encontrada.' : 'Caminho inválido.';
    response.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
    return;
  }

  response.writeHead(result.status, {
    'Cache-Control': 'no-cache',
    'Content-Length': result.fileInfo.size,
    'Content-Type': mimeTypes.get(path.extname(result.filePath).toLowerCase()) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(result.filePath).on('error', (error) => {
    console.error(`Falha ao enviar ${pathname}:`, error);
    response.destroy(error);
  }).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Prévia estática: http://${host}:${port}`);
  console.log(`Arquivos servidos de: ${publicRoot}`);
  console.log('Encerre com Ctrl+C.');
});

server.on('error', (error) => {
  console.error(`Não foi possível iniciar a prévia estática: ${error.message}`);
  process.exitCode = 1;
});
