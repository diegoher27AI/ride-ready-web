"""Builds public/index.html from src/panel.html (the dashboard page) plus the standalone head.
Run after changing the panel: python3 build.py"""
from pathlib import Path
root = Path(__file__).parent
panel = (root / 'src' / 'panel.html').read_text()
head = '''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ride Ready</title>
<meta name="description" content="Tu entrenador de ciclismo: entrenar, ir suave o descansar, cada mañana.">
<meta name="theme-color" content="#05070d">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Ride Ready">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon-v2.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192-v2.png">
<style>
html, body { margin: 0; background: #05070d; color: #fff; -webkit-text-size-adjust: 100%; }
body { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); font: 14px -apple-system, system-ui, sans-serif; overscroll-behavior-y: none; }
/* Week 1: updates come from the server later; the Claude button and its Whoop inputs are hidden. */
#btn-claude, #wbox { display: none !important; }
</style>
<script src="vendor/d3.min.js"></script>
<script src="vendor/supabase.js"></script>
<script src="adapter.js"></script>
</head>
<body>
<div id="dash-root">
'''
tail = '''
</div>
<script src="importer.js"></script>
<script src="account.js"></script>
</body>
</html>
'''
(root / 'public' / 'index.html').write_text(head + panel + tail)
print('public/index.html', len(head + panel + tail), 'bytes')
