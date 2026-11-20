// The existing return page remains the only browser finish mechanism.
const style = `body{margin:0;background:#f3f5f3;color:#263532;font:18px/1.6 system-ui;padding:24px}main{max-width:580px;margin:10vh auto;padding:32px;background:white;border:1px solid #d6dfd9;border-radius:16px;overflow-wrap:anywhere}h1{line-height:1.25}button,a{font:inherit;min-height:48px;display:inline-block;padding:12px}button{background:#275b4b;color:white;border:0;border-radius:8px}a{color:#225748}:focus-visible{outline:3px solid #79540c;outline-offset:4px}`;
function page(nonce: string, title: string, content: string, script: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — PRISMA</title><style nonce="${nonce}">${style}</style></head><body><main><p>PRISMA</p><h1>${title}</h1>${content}</main><script nonce="${nonce}">${script}</script></body></html>`;
}
const messages = `const messages={400:'El intento venció o no es válido. Volvé a comenzar.',401:'Tu sesión venció. Cerrá la sesión anterior para volver a ingresar.',403:'Esta cuenta no tiene acceso habilitado al portal.',409:'Hay un conflicto entre cuentas. Cerrá la sesión correspondiente antes de cambiar de cuenta.',429:'Esperá unos minutos antes de volver a intentar.',503:'El portal no está disponible en este momento.'};`;
export function portalReturnPage(csrf: string, nonce: string) {
  return page(
    nonce,
    'Ingreso al portal',
    `<p id="status" role="status">Completando el ingreso…</p><form id="finish" method="post" action="/api/portal/auth/google/finish"><input type="hidden" name="csrf" value="${csrf}"><button>Completar ingreso</button></form><a href="/app/auth/recovery">Cerrar sesión y volver a comenzar</a>`,
    `${messages}
const form=document.getElementById('finish');let started=false;
async function finish(event){if(event)event.preventDefault();if(started)return;started=true;form.querySelector('button').disabled=true;
try{const response=await fetch(form.action,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Portal-CSRF':form.elements.csrf.value}});
if(response.ok){document.getElementById('status').textContent='Sesión iniciada.';form.hidden=true;location.replace('/app/');}
else{document.getElementById('status').textContent=messages[response.status]||'No se pudo completar el ingreso. Cerrá la sesión anterior para volver a comenzar.';}}
catch{document.getElementById('status').textContent='No pudimos confirmar el ingreso. Revisá tu conexión y cerrá la sesión anterior para volver a comenzar.';}}
form.addEventListener('submit',finish);finish();`,
  );
}
export function portalRecoveryPage(nonce: string) {
  return page(
    nonce,
    'Cerrar sesión',
    '<p id="status" role="status">Podés cerrar tu sesión del portal antes de volver a comenzar. La sesión de administración se conserva.</p><button id="logout">Cerrar sesión</button><p><a href="/app/">Volver al inicio</a></p>',
    `${messages}
const button=document.getElementById('logout');let busy=false;button.addEventListener('click',async()=>{if(busy)return;busy=true;button.disabled=true;try{
const bootstrap=await fetch('/api/portal/auth/logout-csrf',{credentials:'same-origin',cache:'no-store',redirect:'error'});if(!bootstrap.ok)throw Error();const data=await bootstrap.json();if(typeof data.csrf!=='string'||!data.csrf)throw Error();
const response=await fetch('/api/portal/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Portal-CSRF':data.csrf}});if(!response.ok)throw Error();const result=await response.json();if(result.authenticated!==false)throw Error();document.getElementById('status').textContent='Cerraste tu sesión del portal. Podés volver al inicio.';button.hidden=true;
}catch{document.getElementById('status').textContent='No pudimos confirmar el cierre. Revisá tu conexión y volvé a intentar.';}finally{busy=false;button.disabled=false;}});`,
  );
}
