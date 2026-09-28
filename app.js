const sb=supabase.createClient(window.SUPABASE_URL,window.SUPABASE_KEY);
const labels=["Frente","Traseira","Lateral esquerda","Lateral direita","Interior/Painel","Extra"];
let currentPhotos=[],activePhoto=null,pendingPoint=null;
const online=document.getElementById("online");
const sign=document.getElementById("sign"),ctx=sign.getContext("2d");
async function boot(){const {error}=await sb.from("checklists").select("id").limit(1);online.textContent=error?"Offline / erro de conexão":"Online • Supabase conectado";resetForm()}
function show(id){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));document.getElementById(id).classList.remove("hidden");if(id==="novo")resetForm();if(id==="lista")renderLista()}
async function resetForm(){currentPhotos=[];document.getElementById("photos").innerHTML="";labels.forEach((x,i)=>addPhotoSlot(x,i));clearSign();document.getElementById("osNum").textContent="...";const {data,error}=await sb.rpc("next_checklist_os");document.getElementById("osNum").textContent=error?"automática":String(data).padStart(4,"0")}
function addPhotoSlot(label,i){const d=document.createElement("div");d.className="photo";d.innerHTML=`<input type="file" accept="image/*" capture="environment"><div class="cap">${label}</div>`;d.querySelector("input").onchange=()=>handlePhoto(d.querySelector("input").files[0],i,label);document.getElementById("photos").appendChild(d)}
function handlePhoto(file,i,label){if(!file)return;const r=new FileReader();r.onload=()=>{currentPhotos[i]={label,data:r.result,file,marks:[]};renderPhoto(i)};r.readAsDataURL(file)}
function renderPhoto(i){const p=currentPhotos[i],slot=document.getElementById("photos").children[i];slot.innerHTML=`<img src="${p.data}"><div class="cap">${p.label} · toque para marcar</div><div class="marks">${p.marks.map(m=>`<span class="dot" style="left:${m.x}%;top:${m.y}%"></span>`).join("")}</div>`;slot.onclick=()=>openModal(i)}
function openModal(i){if(!currentPhotos[i])return;activePhoto=i;pendingPoint=null;document.getElementById("modalImg").src=currentPhotos[i].data;document.getElementById("desc").value="";document.getElementById("markers").innerHTML=currentPhotos[i].marks.map(m=>`<span class="dot" style="left:${m.x}%;top:${m.y}%"></span>`).join("");document.getElementById("modal").classList.remove("hidden");const img=document.getElementById("modalImg");img.onclick=e=>{const r=img.getBoundingClientRect();pendingPoint={x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100};document.getElementById("markers").innerHTML=currentPhotos[i].marks.map(m=>`<span class="dot" style="left:${m.x}%;top:${m.y}%"></span>`).join("")+`<span class="dot" style="left:${pendingPoint.x}%;top:${pendingPoint.y}%"></span>`}}
function salvarMarca(){if(!pendingPoint)return alert("Toque no ponto da avaria.");currentPhotos[activePhoto].marks.push({x:pendingPoint.x,y:pendingPoint.y,type:document.getElementById("tipo").value,desc:document.getElementById("desc").value});renderPhoto(activePhoto);fecharModal()}
function fecharModal(){document.getElementById("modal").classList.add("hidden")}
function clearSign(){ctx.clearRect(0,0,sign.width,sign.height)}
let drawing=false;function pos(e){const r=sign.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*sign.width/r.width,y:(p.clientY-r.top)*sign.height/r.height}}function start(e){drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()}function move(e){if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()}function end(){drawing=false}
sign.addEventListener("mousedown",start);sign.addEventListener("mousemove",move);window.addEventListener("mouseup",end);sign.addEventListener("touchstart",start);sign.addEventListener("touchmove",move);window.addEventListener("touchend",end);

async function uploadBlob(blob,path){const {error}=await sb.storage.from("checklist-files").upload(path,blob,{upsert:true,contentType:blob.type||"image/jpeg"});if(error)throw error;return path}
async function dataUrlToBlob(url){const r=await fetch(url);return await r.blob()}

async function finalizar(){
 const funcionario=document.getElementById("funcionario").value.trim(),cliente=document.getElementById("cliente").value.trim(),placa=document.getElementById("placa").value.trim().toUpperCase();
 if(!funcionario||!cliente||!placa)return alert("Preencha funcionário, cliente e placa.");
 const checks=[...document.querySelectorAll(".checks input:checked")].map(x=>x.value);
 const {data:check,error}=await sb.from("checklists").insert({funcionario,cliente,telefone:document.getElementById("telefone").value,veiculo:document.getElementById("veiculo").value,placa,km:document.getElementById("km").value,servico:document.getElementById("servico").value,observacoes:document.getElementById("obs").value,itens_internos:checks,status:"finalizado",finalized_at:new Date().toISOString()}).select().single();
 if(error)return alert("Erro ao salvar OS: "+error.message);
 try{
  for(const p of currentPhotos.filter(Boolean)){
   const ext=(p.file.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"").toLowerCase()||"jpg";
   const path=`${check.id}/${crypto.randomUUID()}.${ext}`;
   await uploadBlob(p.file,path);
   const {data:photo,error:pe}=await sb.from("checklist_photos").insert({checklist_id:check.id,categoria:p.label,storage_path:path}).select().single();
   if(pe)throw pe;
   for(const m of p.marks){const {error:me}=await sb.from("checklist_marks").insert({photo_id:photo.id,x:m.x,y:m.y,tipo:m.type,descricao:m.desc});if(me)throw me}
  }
  if(ctx.getImageData(0,0,sign.width,sign.height).data.some(v=>v!==0)){const blob=await new Promise(r=>sign.toBlob(r,"image/png"));await uploadBlob(blob,`${check.id}/assinatura.png`);await sb.from("checklists").update({assinatura_path:`${check.id}/assinatura.png`}).eq("id",check.id)}
  alert(`Checklist OS ${String(check.os_num).padStart(4,"0")} salvo online!`);
  show("lista");
 }catch(e){alert("A OS foi criada, mas houve erro ao enviar algum arquivo: "+e.message)}
}
async function renderLista(){const q=(document.getElementById("busca").value||"").trim();let query=sb.from("checklists").select("*").order("created_at",{ascending:false});if(q)query=query.or(`cliente.ilike.%${q}%,placa.ilike.%${q}%,funcionario.ilike.%${q}%`);const {data,error}=await query;const box=document.getElementById("listaBox");if(error){box.innerHTML=`<p>Erro: ${error.message}</p>`;return}box.innerHTML=data.length?data.map(x=>`<div class="item" onclick="abrir(${JSON.stringify(x.id)})"><div><b>OS ${String(x.os_num).padStart(4,"0")}</b> · ${x.cliente}<br><small>${x.veiculo||""} · ${x.placa} · ${x.funcionario}</small></div><span class="status">Finalizado</span></div>`).join(""):"<p class='muted'>Nenhum checklist encontrado.</p>"}
async function abrir(id){const {data:c}=await sb.from("checklists").select("*").eq("id",id).single();const {data:photos}=await sb.from("checklist_photos").select("*").eq("checklist_id",id);let html=`<div class="card"><h1>OS ${String(c.os_num).padStart(4,"0")}</h1><p><b>Cliente:</b> ${c.cliente}<br><b>Veículo:</b> ${c.veiculo||"-"} · <b>Placa:</b> ${c.placa}<br><b>Funcionário:</b> ${c.funcionario}<br><b>Serviço:</b> ${c.servico||"-"}<br><b>Observações:</b> ${c.observacoes||"-"}</p></div><div class="card"><h2>Fotos</h2><div class="gallery">`;
for(const p of (photos||[])){const {data:u}=sb.storage.from("checklist-files").getPublicUrl(p.storage_path);html+=`<div><img src="${u.publicUrl}"><b>${p.categoria}</b></div>`}html+=`</div></div>`;document.getElementById("detalheBox").innerHTML=html;show("detalhe")}
document.getElementById("busca").addEventListener("input",renderLista);
boot();
