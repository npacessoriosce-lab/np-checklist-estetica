const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
const PHOTO_LABELS = ["Frente", "Traseira", "Lateral esquerda", "Lateral direita", "Interior/Painel", "Extra"];
let currentPhotos = [];
let activePhoto = null;
let pendingPoint = null;
let editingId = null;
let existingSignaturePath = null;
let booted = false;

const $ = (id) => document.getElementById(id);
const online = $("online");

function esc(v) {
  return String(v ?? "").replace(/[&<>'"]/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[ch]));
}
function osLabel(n) { return String(n ?? "").padStart(4, "0"); }
function show(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const page = $(id);
  if (page) page.classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
  if (id === "lista") renderLista();
}
function closeModal() {
  const m = $("modal");
  m.classList.add("hidden");
  m.style.display = "none";
  activePhoto = null;
  pendingPoint = null;
}
window.fecharModal = closeModal;

async function boot() {
  if (booted) return;
  booted = true;
  const { error } = await sb.from("checklists").select("id").limit(1);
  online.textContent = error ? "Offline / erro de conexão" : "Online • Supabase conectado";
  newChecklist();
}

function newChecklist() {
  editingId = null;
  existingSignaturePath = null;
  show("novo");
  resetForm();
}
window.novoChecklist = newChecklist;

async function resetForm() {
  currentPhotos = [];
  $("photos").innerHTML = "";
  PHOTO_LABELS.forEach((label, i) => addPhotoSlot(label, i));
  setFields({});
  $("formTitle").textContent = "Novo checklist";
  $("saveBtn").textContent = "Finalizar checklist";
  $("saveBtn").disabled = false;
  $("osNum").textContent = "...";
  const { data, error } = await sb.rpc("next_checklist_os");
  $("osNum").textContent = error ? "automática" : osLabel(data);
}

function statusLabel(v) {
  const map={aguardando:"Aguardando",em_andamento:"Em andamento",finalizado:"Finalizado",entregue:"Entregue",cancelado:"Cancelado"};
  return map[v] || (v ? String(v).replace(/_/g," ") : "Aguardando");
}
function setFields(c) {
  $("funcionario").value = c.funcionario || "";
  $("cliente").value = c.cliente || "";
  $("telefone").value = c.telefone || "";
  $("veiculo").value = c.veiculo || "";
  $("placa").value = c.placa || "";
  $("km").value = c.km || "";
  $("servico").value = c.servico || "";
  $("status").value = c.status || "aguardando";
  $("obs").value = c.observacoes || "";
  document.querySelectorAll(".checks input").forEach(x => x.checked = (c.itens_internos || []).includes(x.value));
}

function addPhotoSlot(label, index) {
  const d = document.createElement("div");
  d.className = "photo empty-photo";
  d.innerHTML = `<label class="photoPicker"><span class="photoIcon">＋</span><strong>${esc(label)}</strong><small>Adicionar foto</small><input type="file" accept="image/*" capture="environment"></label>`;
  d.querySelector("input").addEventListener("change", e => handlePhoto(e.target.files[0], index, label));
  $("photos").appendChild(d);
}
function handlePhoto(file, index, label) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentPhotos[index] = { label, data: reader.result, file, marks: [] };
    renderPhoto(index);
  };
  reader.readAsDataURL(file);
}
function renderPhoto(index) {
  const p = currentPhotos[index];
  const slot = $("photos").children[index];
  if (!slot || !p) return;
  slot.className = "photo filled-photo";
  slot.innerHTML = `<button type="button" class="photoRemove" data-photo-remove="${index}" aria-label="Remover foto">×</button><img src="${p.data}" alt="${esc(p.label)}"><div class="cap"><b>${esc(p.label)}</b><span>Toque para marcar avaria</span></div><div class="marks">${p.marks.map(m => `<span class="dot" style="left:${m.x}%;top:${m.y}%"></span>`).join("")}</div>`;
  slot.addEventListener("click", e => {
    if (e.target.closest(".photoRemove")) return;
    openMarkModal(index);
  });
}
function removePhoto(index) {
  const p = currentPhotos[index];
  if (!p) return;
  if (!confirm(`Remover a foto "${p.label}"?`)) return;
  if (p.id) p._deleted = true;
  currentPhotos[index] = null;
  const slot = $("photos").children[index];
  if (slot) {
    slot.className = "photo empty-photo";
    slot.innerHTML = `<label class="photoPicker"><span class="photoIcon">＋</span><strong>${esc(PHOTO_LABELS[index])}</strong><small>Adicionar foto</small><input type="file" accept="image/*" capture="environment"></label>`;
    slot.querySelector("input").addEventListener("change", e => handlePhoto(e.target.files[0], index, PHOTO_LABELS[index]));
  }
}

function openMarkModal(index) {
  const p = currentPhotos[index];
  if (!p) return;
  activePhoto = index;
  pendingPoint = null;
  $("modalImg").src = p.data;
  $("desc").value = "";
  $("tipo").value = "Risco";
  renderMarkers();
  $("modal").classList.remove("hidden");
  $("modal").style.display = "flex";
}
function renderMarkers() {
  if (activePhoto === null || !currentPhotos[activePhoto]) return;
  const marks = currentPhotos[activePhoto].marks || [];
  const img = $("modalImg");
  const markers = $("markers");
  if (!img || !markers) return;
  const place = (m, extra="") => {
    const x = (Number(m.x) / 100) * img.clientWidth;
    const y = (Number(m.y) / 100) * img.clientHeight;
    return `<span class="dot ${extra}" style="left:${x}px;top:${y}px"></span>`;
  };
  markers.innerHTML = marks.map(m => place(m)).join("") + (pendingPoint ? place(pendingPoint,"pending") : "");
}

function pointFromEvent(e) {
  if (activePhoto === null || !currentPhotos[activePhoto]) return null;
  const stage = $("imageStage");
  const img = $("modalImg");
  if (!stage || !img || !img.complete || !img.naturalWidth) return null;
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const px = e.clientX;
  const py = e.clientY;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  if (px < r.left || px > r.right || py < r.top || py > r.bottom) return null;
  return {
    x: Math.max(0, Math.min(100, ((px - r.left) / r.width) * 100)),
    y: Math.max(0, Math.min(100, ((py - r.top) / r.height) * 100))
  };
}

function markImagePointer(e) {
  if (e.type === "pointerdown" && e.button !== 0) return;
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  const point = pointFromEvent(e);
  if (!point) return;
  pendingPoint = point;
  renderMarkers();
}

function markImageTouch(e) {
  if (!e.changedTouches || !e.changedTouches[0]) return;
  const t = e.changedTouches[0];
  const point = pointFromEvent({clientX:t.clientX, clientY:t.clientY});
  if (!point) return;
  if (e.cancelable) e.preventDefault();
  pendingPoint = point;
  renderMarkers();
}

function saveMark() {
  if (activePhoto === null || !pendingPoint) {
    alert("Toque na foto, exatamente no ponto da avaria.");
    return;
  }
  const p = currentPhotos[activePhoto];
  p.marks = p.marks || [];
  p.marks.push({
    x: Number(pendingPoint.x),
    y: Number(pendingPoint.y),
    type: $("tipo").value,
    desc: $("desc").value.trim()
  });
  renderPhoto(activePhoto);
  closeModal();
}

async function uploadBlob(blob, path) {
  const { error } = await sb.storage.from("checklist-files").upload(path, blob, { upsert:true, contentType:blob.type || "image/jpeg" });
  if (error) throw error;
  return path;
}
async function dataUrlToBlob(url) { return await (await fetch(url)).blob(); }
function formData() {
  return {
    funcionario:$("funcionario").value.trim(), cliente:$("cliente").value.trim(), telefone:$("telefone").value.trim(),
    veiculo:$("veiculo").value.trim(), placa:$("placa").value.trim().toUpperCase(), km:$("km").value.trim(),
    servico:$("servico").value.trim(), status:$("status").value, observacoes:$("obs").value.trim(),
    itens_internos:[...document.querySelectorAll(".checks input:checked")].map(x=>x.value)
  };
}
function validate(d) {
  if (!d.funcionario || !d.cliente || !d.placa) { alert("Preencha funcionário, cliente e placa."); return false; }
  return true;
}

async function finalizeChecklist() {
  if (editingId) return saveEdit();
  const d = formData();
  if (!validate(d)) return;
  $("saveBtn").disabled = true;
  $("saveBtn").textContent = "Salvando...";
  const { data:check, error } = await sb.from("checklists").insert({...d,finalized_at:new Date().toISOString()}).select().single();
  if (error) { $("saveBtn").disabled=false; $("saveBtn").textContent="Finalizar checklist"; return alert("Erro ao salvar OS: "+error.message); }
  try {
    await saveFiles(check.id, false);
    alert(`Checklist OS ${osLabel(check.os_num)} salvo com sucesso.`);
    await openChecklist(check.id);
  } catch(e) {
    alert("A OS foi criada, mas ocorreu um erro ao salvar fotos/assinatura: "+e.message);
  } finally { $("saveBtn").disabled=false; }
}
window.finalizar = finalizeChecklist;

async function saveFiles(id, editMode) {
  for (const p of currentPhotos.filter(Boolean)) {
    if (p._deleted) continue;
    let photoId = p.id;
    let storagePath = p.storage_path;
    if (p.file) {
      const ext = ((p.file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg");
      storagePath = `${id}/${p.id ? `foto-${p.id}` : crypto.randomUUID()}.${ext}`;
      await uploadBlob(p.file, storagePath);
      if (p.id) {
        const { error } = await sb.from("checklist_photos").update({storage_path:storagePath}).eq("id",p.id);
        if (error) throw error;
      } else {
        const { data:photo, error } = await sb.from("checklist_photos").insert({checklist_id:id,categoria:p.label,storage_path:storagePath}).select().single();
        if (error) throw error;
        photoId = photo.id; p.id = photoId; p.storage_path = storagePath;
      }
    }
    if (!photoId) continue;
    if (editMode) {
      const { error } = await sb.from("checklist_marks").delete().eq("photo_id",photoId);
      if (error) throw error;
    }
    for (const m of (p.marks || [])) {
      const { error } = await sb.from("checklist_marks").insert({photo_id:photoId,x:m.x,y:m.y,tipo:m.type,descricao:m.desc});
      if (error) throw error;
    }
  }
}

async function renderLista() {
  const box = $("listaBox");
  box.innerHTML = `<div class="loading">Carregando OS...</div>`;
  const { data, error } = await sb.from("checklists").select("*").order("created_at",{ascending:false});
  if (error) { box.innerHTML=`<div class="errorBox">Erro ao carregar: ${esc(error.message)}</div>`; return; }
  const q = ($( "busca").value || "").trim().toLowerCase();
  const rows = (data || []).filter(x => !q || [x.os_num,x.cliente,x.placa,x.funcionario,x.veiculo].some(v => String(v||"").toLowerCase().includes(q)));
  if (!rows.length) { box.innerHTML=`<div class="emptyState"><strong>Nenhuma OS encontrada</strong><span>Crie um novo checklist ou altere a busca.</span></div>`; return; }
  box.innerHTML = rows.map(x => `
    <article class="osItem">
      <div class="osItemMain">
        <div class="osLine"><strong>OS ${osLabel(x.os_num)}</strong><span class="status status-${esc(x.status||"aguardando")}">${esc(statusLabel(x.status||"aguardando"))}</span></div>
        <div class="osClient">${esc(x.cliente||"Sem cliente")}</div>
        <div class="osMeta">${esc(x.veiculo||"Veículo não informado")} ${x.placa?`• ${esc(x.placa)}`:""}</div>
        <div class="osMeta">Responsável: ${esc(x.funcionario||"-")}</div>
      </div>
      <div class="osActions">
        <button type="button" class="viewBtn" data-action="view" data-id="${esc(x.id)}">👁 <span>Visualizar OS</span></button>
        <button type="button" class="editBtn" data-action="edit" data-id="${esc(x.id)}">✎ <span>Editar OS</span></button>
        <button type="button" class="deleteBtn" data-action="delete" data-id="${esc(x.id)}">🗑 <span>Excluir OS</span></button>
      </div>
    </article>`).join("");
}
window.renderLista = renderLista;

async function loadChecklist(id) {
  const { data:c, error:ce } = await sb.from("checklists").select("*").eq("id",id).single();
  if (ce) throw ce;
  const { data:photos, error:pe } = await sb.from("checklist_photos").select("*").eq("checklist_id",id).order("created_at",{ascending:true});
  if (pe) throw pe;
  const ids = (photos||[]).map(p=>p.id);
  let marks=[];
  if (ids.length) {
    const {data,error} = await sb.from("checklist_marks").select("*").in("photo_id",ids);
    if (error) throw error;
    marks=data||[];
  }
  return {c,photos:photos||[],marks};
}
async function deleteChecklist(id) {
  const ok = confirm("Tem certeza que deseja excluir esta OS?\n\nEssa ação não poderá ser desfeita.");
  if (!ok) return;
  try {
    const { data: photos, error: pe } = await sb.from("checklist_photos").select("id,storage_path").eq("checklist_id", id);
    if (pe) throw pe;
    const photoIds = (photos || []).map(p => p.id);
    if (photoIds.length) {
      const { error } = await sb.from("checklist_marks").delete().in("photo_id", photoIds);
      if (error) throw error;
    }
    const { data: check, error: ce } = await sb.from("checklists").select("assinatura_path").eq("id", id).single();
    if (ce) throw ce;
    const paths = (photos || []).map(p => p.storage_path).filter(Boolean);
    if (check?.assinatura_path) paths.push(check.assinatura_path);
    if (paths.length) {
      const { error } = await sb.storage.from("checklist-files").remove(paths);
      if (error) console.warn("Não foi possível remover algum arquivo do Storage:", error);
    }
    if (photoIds.length) {
      const { error } = await sb.from("checklist_photos").delete().in("id", photoIds);
      if (error) throw error;
    }
    const { error: de } = await sb.from("checklists").delete().eq("id", id);
    if (de) throw de;
    await renderLista();
  } catch (e) {
    alert("Não foi possível excluir a OS: " + (e.message || e));
  }
}
window.excluirChecklist = deleteChecklist;

async function openChecklist(id) {
  try {
    const {c,photos,marks} = await loadChecklist(id);
    const checked = c.itens_internos || [];
    let html = `
      <div class="printHeader">
        <img src="np-logo.jpg" alt="NP Acessórios Automotivos" class="printLogo">
        <div class="printTitle"><strong>CHECKLIST DE ATENDIMENTO</strong><span>ENTRADA DO VEÍCULO</span></div>
        <div class="printOs"><strong>OS ${osLabel(c.os_num)}</strong><span>${new Date(c.created_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</span></div>
      </div>
      <div class="detailHeader">
        <button type="button" class="secondary" data-action="back-list">← Voltar para OS</button>
        <div class="detailHeaderInfo"><div class="detailOs">OS ${osLabel(c.os_num)}</div><span class="status status-${esc(c.status||"aguardando")}">${esc(statusLabel(c.status||"aguardando"))}</span></div>
        <div class="detailActions"><button type="button" class="secondary" data-action="print-pdf">▣ Exportar PDF</button><button type="button" class="primary" data-action="detail-edit" data-id="${esc(c.id)}">✎ Editar esta OS</button></div>
      </div>
      <section class="card detailCard"><h2>Dados do atendimento</h2><div class="detailGrid">
        ${detailField("Funcionário",c.funcionario)}${detailField("Cliente",c.cliente)}${detailField("Telefone",c.telefone)}${detailField("Veículo",c.veiculo)}${detailField("Placa",c.placa)}${detailField("KM",c.km)}${detailField("Serviço",c.servico)}${detailField("Status do serviço",statusLabel(c.status))}
      </div><div class="detailLong"><b>Observações</b><p>${esc(c.observacoes)||"Nenhuma observação registrada."}</p></div></section>
      <section class="card detailCard"><h2>Conferência interna</h2><div class="checkView">${checked.length ? checked.map(v=>`<span>✓ ${esc(v)}</span>`).join("") : `<span class="muted">Nenhum item marcado.</span>`}</div></section>
      <section class="card detailCard"><div class="sectionTitle"><div><h2>Fotos e avarias</h2><p class="muted">Fotos registradas na entrada do veículo.</p></div><span class="photoCount">${photos.length} foto(s)</span></div>
      <div class="detailGallery">`;
    if (!photos.length) html += `<div class="emptyState"><strong>Nenhuma foto registrada</strong></div>`;
    for (const p of photos) {
      const {data:u} = sb.storage.from("checklist-files").getPublicUrl(p.storage_path);
      const pm = marks.filter(m=>m.photo_id===p.id);
      html += `<div class="detailPhoto"><div class="photoView"><img src="${u.publicUrl}" alt="${esc(p.categoria)}">${pm.map(m=>`<span class="dot" style="left:${m.x}%;top:${m.y}%"></span>`).join("")}</div><div class="photoTitle">${esc(p.categoria)}</div>`;
      if (pm.length) html += `<div class="marksList">${pm.map((m,i)=>`<div class="markrow"><b>Avaria ${i+1}: ${esc(m.tipo)}</b><span>${esc(m.descricao)||"Sem descrição"}</span></div>`).join("")}</div>`;
      else html += `<div class="muted noMark">Nenhuma avaria marcada.</div>`;
      html += `</div>`;
    }
    html += `</div></section>`;
    html += `<section class="card detailCard signaturePrint"><h2>Assinatura do cliente</h2><div class="signatureLine"></div><div class="signatureCaption">Assinatura do cliente</div></section>`;
    html += `<div class="detailBottomActions"><button type="button" class="secondary" data-action="back-list">← Voltar</button><button type="button" class="secondary" data-action="print-pdf">▣ Exportar PDF</button><button type="button" class="primary" data-action="detail-edit" data-id="${esc(c.id)}">✎ Editar OS</button></div>`;
    $("detalheBox").innerHTML=html;
    show("detalhe");
  } catch(e) { alert("Erro ao abrir a OS: "+(e.message||e)); }
}
window.abrir = openChecklist;
function detailField(label,value){return `<div class="detailField"><small>${esc(label)}</small><strong>${esc(value)||"—"}</strong></div>`;}

async function editChecklist(id) {
  try {
    const {c,photos,marks} = await loadChecklist(id);
    editingId=id;
    existingSignaturePath=c.assinatura_path||null;
    currentPhotos=[];
    $("photos").innerHTML="";
    PHOTO_LABELS.forEach((label,i)=>addPhotoSlot(label,i));
    for (const p of photos) {
      const idx = Math.max(0,PHOTO_LABELS.indexOf(p.categoria));
      const {data:u} = sb.storage.from("checklist-files").getPublicUrl(p.storage_path);
      currentPhotos[idx]={id:p.id,label:p.categoria,data:u.publicUrl,file:null,storage_path:p.storage_path,marks:marks.filter(m=>m.photo_id===p.id).map(m=>({x:m.x,y:m.y,type:m.tipo,desc:m.descricao}))};
      renderPhoto(idx);
    }
    setFields(c);
    $("formTitle").textContent=`Editar checklist • OS ${osLabel(c.os_num)}`;
    $("osNum").textContent=osLabel(c.os_num);
    $("saveBtn").textContent="Salvar alterações";
    $("saveBtn").disabled=false;
      show("novo");
  } catch(e) { alert("Erro ao carregar a OS para edição: "+(e.message||e)); }
}
window.editarChecklist=editChecklist;

async function saveEdit() {
  const d=formData();
  if(!validate(d)) return;
  $("saveBtn").disabled=true;
  $("saveBtn").textContent="Salvando alterações...";
  const {error}=await sb.from("checklists").update(d).eq("id",editingId);
  if(error){$("saveBtn").disabled=false;$("saveBtn").textContent="Salvar alterações";return alert("Erro ao atualizar OS: "+error.message);}
  try {
    await saveFiles(editingId,true);
  } catch(e) {
    console.warn("Aviso ao atualizar arquivos da OS:", e);
  }
  await openChecklist(editingId);
  $("saveBtn").disabled=false;
}
window.salvarEdicao=saveEdit;

// Eventos de navegação e ações — sem onclick inline, para funcionar de forma consistente no GitHub Pages.
document.addEventListener("click", e => {
  const action = e.target.closest("[data-action]");
  if (action) {
    const type = action.dataset.action;
    const id = action.dataset.id;
    if(type==="view" || type==="detail-view") return openChecklist(id);
    if(type==="edit" || type==="detail-edit") return editChecklist(id);
    if(type==="delete") return deleteChecklist(id);
    if(type==="print-pdf") return window.print();
    if(type==="back-list") return show("lista");
  }
  const remove = e.target.closest("[data-photo-remove]");
  if(remove){ e.preventDefault(); e.stopPropagation(); removePhoto(Number(remove.dataset.photoRemove)); }
});

$("newBtn").addEventListener("click",newChecklist);
$("listBtn").addEventListener("click",()=>show("lista"));
$("saveBtn").addEventListener("click",finalizeChecklist);
$("clearSignBtn").addEventListener("click",clearSign);
$("closeModalBtn").addEventListener("click",closeModal);
$("saveMarkBtn").addEventListener("click",saveMark);
const modalImg = $("modalImg");
if (modalImg) {
  modalImg.addEventListener("pointerdown", markImagePointer, {passive:false});
  modalImg.addEventListener("click", markImagePointer);
  modalImg.addEventListener("touchend", markImageTouch, {passive:false});
  modalImg.addEventListener("load", renderMarkers);
  modalImg.style.touchAction = "none";
}
const tapLayer = $("tapLayer");
if (tapLayer) {
  tapLayer.style.pointerEvents = "auto";
  tapLayer.style.touchAction = "none";
  tapLayer.addEventListener("pointerdown", markImagePointer, {passive:false});
  tapLayer.addEventListener("click", markImagePointer);
  tapLayer.addEventListener("touchend", markImageTouch, {passive:false});
}
window.addEventListener("resize",()=>{ if(!$("modal").classList.contains("hidden")) renderMarkers(); });
$("busca").addEventListener("input",renderLista);
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});

boot();
