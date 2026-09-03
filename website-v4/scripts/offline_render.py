from pathlib import Path
import re,base64,mimetypes
root=Path(__file__).resolve().parent.parent/'dist'

def uri(p):
 return 'data:'+({'js':'text/javascript','svg':'image/svg+xml','webp':'image/webp','woff2':'font/woff2'}.get(p.suffix[1:],mimetypes.guess_type(str(p))[0] or 'application/octet-stream'))+';base64,'+base64.b64encode(p.read_bytes()).decode()

def generate(poster=True):
 html=(root/'index.html').read_text()
 def css(m):
  rel=re.search(r'href="([^"?]+)',m[0])[1];p=root/rel;s=p.read_text()
  def bg(b):
   v=b[2]
   if v.startswith(('data:','http','#')):return b[0]
   pp=(p.parent/v.split('?')[0]).resolve()
   return 'url("'+uri(pp)+'")' if pp.exists() else b[0]
  s=re.sub(r'url\(\s*([\'\"]?)([^\'\")]+)\1\s*\)',bg,s)
  return '<style>'+s+'</style>'
 html=re.sub(r'<link[^>]*href="assets/css/[^>]+>',css,html)
 scripts=[]
 def js(m):
  rel=re.search(r'src="([^"?]+)',m[0])[1];s=(root/rel).read_text()
  if rel.endswith('app.js'):
   s=re.sub(r'const OFFLINE = [^;]+;', 'const OFFLINE = true;',s)
   s=re.sub(r'const POSTER_ONLY = [^;]+;',f'const POSTER_ONLY = {str(poster).lower()};',s)
  scripts.append('<script>'+s.replace('</script','<\\/script')+'</script>');return ''
 html=re.sub(r'<script[^>]*src="assets/js/[^>]+></script>',js,html)
 # Replace paths in rendered DOM AND embedded content used by profiles/menu redraws.
 files=[p for p in (root/'assets').rglob('*') if p.suffix.lower() in {'.webp','.png','.jpg','.svg','.mp4'}]
 for p in sorted(files,key=lambda p:len(str(p)),reverse=True):
  rel=p.relative_to(root).as_posix()
  if rel in html:html=html.replace(rel,uri(p))
 html=re.sub(r'<link[^>]*rel="(?:preload|manifest|icon|apple-touch-icon)"[^>]*>','',html)
 html=html.replace('</body>',''.join(scripts)+'</body>')
 return html
if __name__=='__main__':
 print(len(generate()))
