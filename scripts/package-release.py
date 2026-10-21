"""Create a clean source handoff without deleting the original workspace."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TREES = ['app', 'components', 'db', 'drizzle', 'lib', 'scripts', 'workers', 'public', '.github']
FILES = ['package.json', 'package-lock.json', 'vite.config.ts', 'next.config.ts', 'tsconfig.json', 'eslint.config.mjs', 'drizzle.config.ts', 'cloudflare-env.d.ts', '.gitignore', '.npmrc', '.nvmrc', '.env.example', '.env.production.example', 'AGENTS.md', 'README.md', 'DEPLOYMENT.md', 'PRODUCTION_SETUP.md', 'AUTH.md', 'INGESTION.md', 'SEMANTIC_FEED.md', 'BACKFILL.md', 'RECOMMENDATIONS.md', 'wrangler.jsonc']
EXCLUDED_TREES = ['components/ui', 'scripts/connector-preview', 'public/textures', 'public/reference/logos']
EXCLUDED_FILES = {
    'components/connector-error.tsx', 'lib/connector-context.ts', 'lib/connector-contract.mts', 'lib/connector-errors.mts',
    'lib/connector-preview.d.ts', 'lib/connectors.ts', 'lib/utils.ts', 'scripts/install-ci.sh', 'scripts/install-pnpm.sh',
    'scripts/pnpm-install.mjs', 'scripts/npm-install.mjs', 'scripts/build-verified.sh', 'scripts/sites-env.sh',
    'scripts/execution-profile.mjs', 'public/file.svg', 'public/globe.svg', 'public/window.svg', 'public/assets-notes.md',
    'public/fonts/newsreader-latin.woff2', 'public/fonts/Newsreader-OFL.txt', 'public/fonts/instrument-sans-latin.woff2',
    'public/fonts/InstrumentSans-OFL.txt', 'public/fonts/geist-mono-latin.woff2', 'public/fonts/GeistMono-OFL.txt',
}


def include(path):
    relative = path.relative_to(ROOT).as_posix()
    return (not path.is_symlink() and path.resolve().is_relative_to(ROOT)
            and not any(part in {'__pycache__', 'node_modules', '.git'} for part in path.parts)
            and path.suffix not in {'.pyc', '.sqlite', '.sqlite3', '.pem'}
            and relative not in EXCLUDED_FILES
            and not any(relative.startswith(tree + '/') for tree in EXCLUDED_TREES))


def package():
    files = {ROOT / name for name in FILES}
    for tree in TREES:
        files.update(path for path in (ROOT / tree).rglob('*') if path.is_file() and include(path))
    if any(not path.is_file() for path in files):
        raise RuntimeError('A required release file is missing')
    output = ROOT / 'outputs/releases'
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    destination = output / f'readwell-source-{stamp}.zip'
    entries = {path.relative_to(ROOT).as_posix(): path for path in files}
    # The optional collector is public source; its private database is never copied.
    collector = ROOT.parent if (ROOT.parent / 'dailyblogs.py').is_file() else ROOT / 'collector'
    for name in ['dailyblogs.py', 'test_dailyblogs.py', 'sources.json', 'feeds.opml']:
        source = collector / name
        if not source.is_file():
            raise RuntimeError(f'Missing public collector source: {name}')
        entries['collector/' + name] = source
    manifest = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in sorted(entries.items())}
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED, strict_timestamps=False) as archive:
        for name, path in sorted(entries.items()):
            archive.write(path, 'readwell/' + name)
        archive.writestr('readwell/RELEASE_MANIFEST.json', json.dumps({'createdAt': stamp, 'files': manifest}, indent=2) + '\n')
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('Release ZIP integrity verification failed')
        names = archive.namelist()
        if any('/.env' in name and name not in {'readwell/.env.example', 'readwell/.env.production.example'} for name in names):
            raise RuntimeError('Unexpected environment file in archive')
    report = {'archive': str(destination), 'files': len(entries), 'bytes': destination.stat().st_size,
              'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'originalFilesDeleted': False}
    (output / 'latest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    package()
