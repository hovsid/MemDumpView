/* main.js
   This file contains the original page's JavaScript moved into a module file.
   The content/logic was preserved exactly but is now in ES module scope to
   make it easier to evolve into multiple modules later.
*/

/* ===== Utility ===== */
function escapeHtml(text){return String(text).replace(/[<>&"'`]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));}
function makeMovable(popup, header){
    let offsetX=0,offsetY=0,isDown=false;
    header=header||popup.querySelector('.bar-popup-header,.info-popup-header');
    if(!header) return;
    header.onmousedown=e=>{
        isDown=true;offsetX=e.clientX-popup.offsetLeft;offsetY=e.clientY-popup.offsetTop;
        document.body.style.userSelect="none";
    };
    document.addEventListener('mousemove',e=>{
        if(!isDown)return;
        popup.style.left=(e.clientX-offsetX)+"px";
        popup.style.top=(e.clientY-offsetY)+"px";
    });
    document.addEventListener('mouseup',()=>{isDown=false;document.body.style.userSelect="";});
}
function formatBytes(bytes){
    if(bytes===0) return "0 B";
    const units=['B','KB','MB','GB','TB','PB'];
    const i=Math.floor(Math.log(bytes)/Math.log(1024));
    const v=bytes/Math.pow(1024,i);
    return (v>=100?v.toFixed(0):v>=10?v.toFixed(1):v.toFixed(2))+" "+units[i];
}

/* ===== State ===== */
let gcPairs=[];
let heapValuesOriginal=[];
let heapGcMarkers=[];
let heapGcMarkerValues=[];
let heapGcMarkerRawValues=[];
let heapMarkerOffset=0;
let plotRendered=false;

let dsCurrentX=[];
let dsCurrentY=[];
let dsActive=true;
let lastAlgo='bucket';
let lastTarget=3000;

let simulatedCompactedX=[];
let simulatedCompactedY=[];
let haveSimulation=false;

/* ===== Parsing Merged File ===== */
function parseMergedFile(content){
    const lines = content.split(/\r?\n/);
    const phase1Idx = lines.findIndex(l => /^phase1:\s*heap use\s*$/i.test(l.trim()));
    const phase2Idx = lines.findIndex(l => /^phase2:\s*page dump\s*$/i.test(l.trim()));
    const statusEl = document.getElementById('load-status');

    if(phase1Idx === -1 || phase2Idx === -1 || phase2Idx <= phase1Idx){
        statusEl.innerHTML = "<span style='color:#c62828'>Invalid merged file format: missing phase markers.</span>";
        return;
    }

    const heapLines = lines.slice(phase1Idx+1, phase2Idx).filter(l => l.trim().length>0);
    const gcDumpLines = lines.slice(phase2Idx+1);

    // Parse heap timeline portion
    parseHeapTimelineFromLines(heapLines);

    // Parse GC dump portion (reuse existing pipeline)
    const gcDumpText = gcDumpLines.join("\n");
    const blocks = parseGCDumpBlocks(gcDumpText);
    gcPairs = pairBlocks(blocks);
    renderGCPairs();

    statusEl.innerHTML = `<span style='color:#2e7d32'>Loaded heap samples: ${heapValuesOriginal.length}, GC pairs: ${gcPairs.length}</span>`;
}

/* ===== Old GC Dump Helpers (unchanged) ===== */
function parseGCDumpBlocks(text){
    const lines=text.split(/\r?\n/);
    let blocks=[],current=null;
    for(const line of lines){
        const header=line.match(/-+(before|after) GC (\d+) -+/);
        if(header){
            if(current) blocks.push(current);
            current={type:header[1], idx:parseInt(header[2]), content:[]};
        } else if(current && line.trim().length){
            current.content.push(line);
        }
    }
    if(current) blocks.push(current);
    return blocks;
}
function pairBlocks(blocks){
    let pairs=[]; let i=0;
    while(i<blocks.length){
        if(blocks[i].type==="before" && blocks[i+1] && blocks[i+1].type==="after" && blocks[i].idx===blocks[i+1].idx){
            pairs.push({idx:blocks[i].idx,before:blocks[i],after:blocks[i+1]});
            i+=2;
        } else i++;
    }
    return pairs;
}
function parsePageDistribution(contentLines){
    let dist={};
    for(const line of contentLines){
        let fb=line.match(/^(\d+):\s*(.*)$/);
        let pf=line.match(/^([a-zA-Z_]+):\s*(.*)$/);
        if(fb){
            dist[`FixedBlockPage_${fb[1]}`]=parsePageUsages(fb[2],"FixedBlockPage",fb[1]);
        } else if(pf){
            let name=pf[1];
            let kind="Other";
            if(name==="nextFitPages") kind="NextFitPage";
            else if(name==="singleObjectPages") kind="SingleObjectPage";
            else if(name==="extraObjectPages") kind="ExtraObjectPage";
            dist[name]=parsePageUsages(pf[2],kind,name);
        }
    }
    return dist;
}
function parsePageUsages(data,kind,name){
    const re=/\((\d+)%\)|\+|\-/g; let m; let out=[];
    while((m=re.exec(data))){
        if(m[1]!==undefined) out.push({ type:'partial', value:parseInt(m[1]), kind, name });
        else if(m[0]==='+') out.push({ type:'full', value:100, kind, name });
        else if(m[0]==='-') out.push({ type:'empty', value:0, kind, name });
    }
    return out;
}
function kindOrder(k){
    if(k.startsWith("FixedBlockPage_")) return 1+parseInt(k.split("_")[1]);
    if(k==="nextFitPages") return 100000;
    if(k==="singleObjectPages") return 200000;
    if(k==="extraObjectPages") return 300000;
    return 9999999;
}
function countTotalPages(dist){ let t=0; for(const k in dist) t+=dist[k].length; return t; }
function computeSummary(bef,aft){
    function agg(d){ let pages=0,sum=0; for(const k in d){ for(const u of d[k]){ pages++; sum+=u.value;} } return {pages,mean:pages?sum/pages:0}; }
    const b=agg(bef), a=agg(aft);
    let released=0;
    const keys=new Set([...Object.keys(bef),...Object.keys(aft)]);
    for(const k of keys){
        const bc=bef[k]?bef[k].length:0;
        const ac=aft[k]?aft[k].length:0;
        if(ac<bc) released+=(bc-ac);
    }
    return { pagesBefore:b.pages,pagesAfter:a.pages,pagesReleased:released,occupancyBefore:b.mean,occupancyAfter:a.mean,deltaOccupancy:a.mean-b.mean };
}
function getMemStatForGcIdx(gcIdx){
    const sorted=gcPairs.map(p=>p.idx).sort((a,b)=>a-b);
    const pos=sorted.indexOf(gcIdx);
    if(pos===-1||pos>=heapGcMarkerRawValues.length) return null;
    return heapGcMarkerRawValues[pos];
}
function simulateCompaction(dist){
    let totalPercent=0;
    for(const k in dist){ for(const u of dist[k]) totalPercent+=u.value; }
    if(totalPercent===0) return { Compacted: [] };
    const fullPages=Math.floor(totalPercent/100);
    const remainder=totalPercent - fullPages*100;
    let arr=[];
    for(let i=0;i<fullPages;i++) arr.push({type:'full',value:100,kind:'CompactedPage',name:'compact'});
    if(remainder>0) arr.push({type:'partial',value:Math.round(remainder*100)/100,kind:'CompactedPage',name:'compact'});
    return { Compacted: arr };
}

/* ===== Parse Heap Timeline (from lines list) ===== */
function parseHeapTimelineFromLines(lines){
    heapValuesOriginal=[]; heapGcMarkers=[]; heapGcMarkerValues=[]; heapGcMarkerRawValues=[];
    let min=Infinity,max=-Infinity;
    for(const line of lines){
        const parts=line.split(',');
        if(parts.length!==2) continue;
        const v=parseFloat(parts[0]);
        if(isNaN(v)) continue;
        min=Math.min(min,v); max=Math.max(max,v);
    }
    heapMarkerOffset=(max-min)*0.0001;
    for(let i=0;i<lines.length;i++){
        const parts=lines[i].split(',');
        if(parts.length!==2) continue;
        const v=parseFloat(parts[0]);
        const status=parts[1].trim().toLowerCase();
        if(isNaN(v)) continue;
        heapValuesOriginal.push(v);
        if(status==="true"){
            heapGcMarkers.push(i+1);
            heapGcMarkerRawValues.push(v);
            heapGcMarkerValues.push(v+heapMarkerOffset);
        }
    }
    applyDownsampling(lastAlgo,lastTarget);
    renderHeapPlot();
    buildCorrelationPanel();
}

/* ===== GC Pairs Rendering + Simulation ===== */
function renderGCPairs(){
    const container=document.getElementById('page-dump-view');
    container.innerHTML="";
    simulatedCompactedX=[]; simulatedCompactedY=[]; haveSimulation=false;

    if(gcPairs.length===0){
        container.innerHTML="<div style='color:#555'>No GC before/after pairs found.</div>";
        buildCorrelationPanel();
        updateSimulatedLine();
        return;
    }

    const sortedPairIndices=gcPairs.map(p=>p.idx).sort((a,b)=>a-b);
    let simMap=new Map();

    for(const pair of gcPairs){
        const beforeDist=parsePageDistribution(pair.before.content);
        const afterDist=parsePageDistribution(pair.after.content);
        const optimizedBefore=simulateCompaction(beforeDist);
        const optimizedAfter=simulateCompaction(afterDist);

        let allKeys=[...new Set([...Object.keys(beforeDist),...Object.keys(afterDist)])];
        allKeys.sort((a,b)=>kindOrder(a)-kindOrder(b));
        const optKeys=['Compacted'];

        const unifiedSize=Math.ceil(Math.sqrt(Math.max(
            countTotalPages(beforeDist),
            countTotalPages(afterDist),
            countTotalPages(optimizedBefore),
            countTotalPages(optimizedAfter)
        )));

        const wrapper=document.createElement('div');
        wrapper.className='gc-pair-wrapper';

        const summary=computeSummary(beforeDist,afterDist);
        const deltaClass= summary.deltaOccupancy>0?'delta-pos':(summary.deltaOccupancy<0?'delta-neg':'delta-zero');

        const memStatValue=getMemStatForGcIdx(pair.idx);
        let simulatedValue=null;
        let memEstimateHtml="";
        if(memStatValue!=null){
            const occupancyFactor=summary.occupancyAfter/100;
            simulatedValue=memStatValue*occupancyFactor;
            const memReductionAmount=memStatValue - simulatedValue;
            memEstimateHtml=`
               <div>Overall occupancy after GC: <b>${summary.occupancyAfter.toFixed(2)}%</b></div>
               <div>Simulated compacted bytes: <b>${formatBytes(simulatedValue)}</b> (base: ${formatBytes(memStatValue)})</div>
               <div>Estimated memory reduction if perfectly compacted: <span class="${memReductionAmount>0?'mem-estimate':'mem-nochange'}">-${formatBytes(memReductionAmount)}</span></div>
            `;
        } else {
            memEstimateHtml=`<div>Simulated compacted bytes: <span class="mem-nochange">N/A (no heap marker)</span></div>`;
        }
        if(simulatedValue!=null) simMap.set(pair.idx, simulatedValue);

        const summaryPanel=document.createElement('div');
        summaryPanel.className='gc-summary-panel';
        summaryPanel.innerHTML=`
          <div class="gc-summary-header-row">
            <div class="gc-summary-title">Conclusion GC ${pair.idx}</div>
            <div class="layout-tools">
              <button class="gc-btn charts-btn">Charts</button>
              <button class="gc-btn highlight-btn">Highlight</button>
              <button class="gc-btn zoom-in-btn">Zoom +</button>
              <button class="gc-btn zoom-out-btn">Zoom -</button>
              <button class="gc-btn zoom-reset-btn">Reset</button>
            </div>
          </div>
          <div>Pages before: <b>${summary.pagesBefore}</b></div>
          <div>Pages after: <b>${summary.pagesAfter}</b></div>
          <div>Pages released: <span class="released">${summary.pagesReleased}</span></div>
          <div>Overall occupancy before: <b>${summary.occupancyBefore.toFixed(2)}%</b></div>
          <div>Overall occupancy after: <b>${summary.occupancyAfter.toFixed(2)}%</b></div>
          <div>Occupancy change: <span class="${deltaClass}">${summary.deltaOccupancy>0?'+':''}${summary.deltaOccupancy.toFixed(2)} pp</span></div>
          ${memEstimateHtml}
        `;
        wrapper.appendChild(summaryPanel);

        const originalRow=document.createElement('div');
        originalRow.className='gc-squares-row';
        const beforePanel=document.createElement('div');
        beforePanel.className='gc-sq-panel';
        beforePanel.innerHTML=`<div class="gc-sq-title">Before GC ${pair.idx}</div>`;
        beforePanel.appendChild(renderSquareGrid(beforeDist,allKeys,"before",pair.idx,unifiedSize));
        const afterPanel=document.createElement('div');
        afterPanel.className='gc-sq-panel';
        afterPanel.innerHTML=`<div class="gc-sq-title">After GC ${pair.idx}</div>`;
        afterPanel.appendChild(renderSquareGrid(afterDist,allKeys,"after",pair.idx,unifiedSize));
        originalRow.appendChild(beforePanel);
        originalRow.appendChild(afterPanel);
        wrapper.appendChild(originalRow);

        const optRow=document.createElement('div');
        optRow.className='gc-squares-row';
        const optBeforePanel=document.createElement('div');
        optBeforePanel.className='gc-sq-panel';
        optBeforePanel.innerHTML=`<div class="gc-optimized-label">SIMULATED COMPACT</div><div class="gc-sq-title">Optimized Before GC ${pair.idx}</div>`;
        optBeforePanel.appendChild(renderSquareGrid(optimizedBefore,optKeys,"optimized-before",pair.idx,unifiedSize,true));
        const optAfterPanel=document.createElement('div');
        optAfterPanel.className='gc-sq-panel';
        optAfterPanel.innerHTML=`<div class="gc-optimized-label">SIMULATED COMPACT</div><div class="gc-sq-title">Optimized After GC ${pair.idx}</div>`;
        optAfterPanel.appendChild(renderSquareGrid(optimizedAfter,optKeys,"optimized-after",pair.idx,unifiedSize,true));
        optRow.appendChild(optBeforePanel);
        optRow.appendChild(optAfterPanel);
        wrapper.appendChild(optRow);

        container.appendChild(wrapper);

        summaryPanel.querySelector('.charts-btn').onclick=()=>showUnifiedBarPopup(beforeDist,afterDist,allKeys,'GC '+pair.idx);
        summaryPanel.querySelector('.highlight-btn').onclick=()=>{
            highlightAndFocusHeapMarker(pair.idx);
            jumpToHeapTimeline();
        };
        summaryPanel.querySelector('.zoom-in-btn').onclick=()=>manualZoom(wrapper,+2);
        summaryPanel.querySelector('.zoom-out-btn').onclick=()=>manualZoom(wrapper,-2);
        summaryPanel.querySelector('.zoom-reset-btn').onclick=()=>resetZoom(wrapper);
    }

    const sortedIndices=gcPairs.map(p=>p.idx).sort((a,b)=>a-b);
    simulatedCompactedX=[]; simulatedCompactedY=[];
    for(let pos=0; pos<heapGcMarkers.length && pos<sortedIndices.length; pos++){
        const gcIdx=sortedIndices[pos];
        if(simMap.has(gcIdx)){
            simulatedCompactedX.push(heapGcMarkers[pos]);
            simulatedCompactedY.push(simMap.get(gcIdx));
        }
    }
    haveSimulation = simulatedCompactedX.length > 0;

    buildCorrelationPanel();
    responsiveRescaleAllGrids();
    window.addEventListener('resize', ()=>{
        if(!document.querySelector('.gc-pair-wrapper[data-manual-zoom="true"]')) responsiveRescaleAllGrids();
        adjustAllPairLayouts();
    });
    adjustAllPairLayouts();
    updateSimulatedLine();
}

function renderSquareGrid(groups, allKeys, when, gcIdx, forcedSize, isOptimized=false){
    let allUsages=[];
    for(const key of allKeys){
        const arr=groups[key]||[];
        allUsages.push(...arr.map((u,i)=>({...u,pageKey:key,localIdx:i,optimized:isOptimized})));
    }
    const total=allUsages.length;
    const size=forcedSize!==undefined?forcedSize:Math.ceil(Math.sqrt(total));
    const wrapper=document.createElement('div');
    wrapper.className='square-grid-wrapper';
    const grid=document.createElement('div');
    grid.className='square-grid';
    grid.dataset.gridSize=size;
    grid.dataset.total=total;
    grid.dataset.gcIdx=gcIdx;
    grid.dataset.when=when;
    if(isOptimized) grid.dataset.optimized="true";
    for(let i=0;i<size*size;i++){
        const cell=document.createElement('div');
        cell.className='cell';
        if(i<total){
            const usage=allUsages[i];
            const p=usage.value;
            let r=255,g=255-Math.round(255*p/100),b=255-Math.round(255*p/100);
            cell.style.background=`rgb(${r},${g},${b})`;
            if(usage.localIdx===0) cell.style.boxShadow="0 0 0 2px #999";
            cell.title=`${usage.optimized?'Compacted':'Original'} ${usage.kind} ${usage.name||''} #${usage.localIdx} : ${p}%`;
            cell.onclick=(ev)=>{
                showInfoPopup({
                    kind:usage.kind,
                    name:usage.name||'',
                    index:usage.localIdx,
                    percent:p,
                    when:when,
                    gcIdx:gcIdx,
                    optimized:usage.optimized
                });
                ev.stopPropagation();
            };
        } else cell.style.background="#eee";
        grid.appendChild(cell);
    }
    wrapper.appendChild(grid);
    return wrapper;
}

/* ===== Layout scaling ===== */
function responsiveRescaleAllGrids(){
    document.querySelectorAll('.square-grid').forEach(grid=>{
        const size=parseInt(grid.dataset.gridSize,10);
        if(!size) return;
        const wrapper=grid.parentElement;
        const wrapperWidth=wrapper.clientWidth||Math.min(window.innerWidth*0.9,900);
        const gap=parseFloat(getComputedStyle(grid).gap)||2;
        const preferred=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-max-cell'))||18;
        const minCell=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-min-cell'))||6;
        let cell=preferred;
        const needed=size*cell + (size-1)*gap;
        if(needed>wrapperWidth){
            cell=Math.floor((wrapperWidth - (size-1)*gap)/size);
            if(cell<minCell) cell=minCell;
        }
        applyCellSize(grid,cell);
        if(!grid.dataset.originalCellSize) grid.dataset.originalCellSize=cell;
    });
    adjustAllPairLayouts();
}
function applyCellSize(grid,cell){
    const size=parseInt(grid.dataset.gridSize,10);
    grid.style.gridTemplateColumns=`repeat(${size}, ${cell}px)`;
    grid.style.gridTemplateRows=`repeat(${size}, ${cell}px)`;
    grid.querySelectorAll('.cell').forEach(c=>{
        c.style.width=cell+"px";
        c.style.height=cell+"px";
    });
    grid.dataset.cellSize=cell;
}
function manualZoom(wrapper,delta){
    wrapper.dataset.manualZoom="true";
    const grids=[...wrapper.querySelectorAll('.square-grid')];
    if(!grids.length) return;
    let current=parseInt(grids[0].dataset.cellSize||grids[0].querySelector('.cell')?.offsetWidth||14,10);
    let next=current+delta;
    if(next<4) next=4;
    if(next>60) next=60;
    grids.forEach(g=>applyCellSize(g,next));
    adjustPairLayout(wrapper);
}
function resetZoom(wrapper){
    const grids=[...wrapper.querySelectorAll('.square-grid')];
    grids.forEach(g=>{
        const origin=parseInt(g.dataset.originalCellSize||14,10);
        applyCellSize(g,origin);
    });
    delete wrapper.dataset.manualZoom;
    adjustPairLayout(wrapper);
}
function adjustPairLayout(wrapper){
    wrapper.querySelectorAll('.gc-squares-row').forEach(row=>{
        const panels=[...row.querySelectorAll('.gc-sq-panel')];
        if(panels.length<2){ row.classList.remove('stacked'); return; }
        const w=row.clientWidth;
        const totalNeeded=panels.reduce((sum,p)=>{
            const grid=p.querySelector('.square-grid');
            if(!grid) return sum;
            const size=parseInt(grid.dataset.gridSize,10);
            const cellSize=parseInt(grid.dataset.cellSize||14,10);
            const gap=parseFloat(getComputedStyle(grid).gap)||2;
            const inner=size*cellSize + (size-1)*gap;
            const wrap=grid.parentElement;
            const padL=parseFloat(getComputedStyle(wrap).paddingLeft)||0;
            const padR=parseFloat(getComputedStyle(wrap).paddingRight)||0;
            const borderL=parseFloat(getComputedStyle(wrap).borderLeftWidth)||0;
            const borderR=parseFloat(getComputedStyle(wrap).borderRightWidth)||0;
            return sum + inner + padL + padR + borderL + borderR;
        },0)+28;
        if(totalNeeded>w) row.classList.add('stacked'); else row.classList.remove('stacked');
    });
}
function adjustAllPairLayouts(){ document.querySelectorAll('.gc-pair-wrapper').forEach(adjustPairLayout); }

/* ===== Popups ===== */
function showUnifiedBarPopup(beforeDist,afterDist,allKeys,title){
    let beforeMeta=[],afterMeta=[],maxCount=1,maxDiff=1;
    for(const key of allKeys){
        const b=beforeDist[key]||[], a=afterDist[key]||[];
        beforeMeta.push({key,count:b.length,kind:b[0]?.kind||"Unknown",name:b[0]?.name||key,usages:b});
        afterMeta.push({key,count:a.length,kind:a[0]?.kind||"Unknown",name:a[0]?.name||key,usages:a});
        maxCount=Math.max(maxCount,b.length,a.length);
        maxDiff=Math.max(maxDiff,Math.abs(a.length-b.length));
    }
    const popup=document.createElement('div');
    popup.className='bar-popup';
    popup.innerHTML=`
      <div class="bar-popup-header">${escapeHtml(title)} Page Type Counts
        <button class="close-btn" onclick="this.closest('.bar-popup').remove()">&times;</button>
      </div>
      <div style="display:flex;gap:28px;flex-wrap:wrap;">
        ${buildBarSection(beforeMeta,maxCount,"Before")}
        ${buildBarSection(afterMeta,maxCount,"After")}
        ${buildDiffSection(beforeMeta,afterMeta,maxDiff,"Diff")}
      </div>`;
    document.body.appendChild(popup);
    makeMovable(popup, popup.querySelector('.bar-popup-header'));
}
function buildBarSection(meta,maxCount,title){
    let html=`<div style="flex:1;min-width:250px;"><div style="font-weight:bold;text-align:center;margin-bottom:6px;">${escapeHtml(title)}</div><div>`;
    for(const m of meta){
        const label=`${m.kind}${m.kind==="FixedBlockPage"?'['+m.name+']':(m.name?' '+m.name:'')} (${m.count})`;
        const barLen=Math.max(6,Math.round((m.count/maxCount)*380));
        const mean=m.usages.length?Math.round(m.usages.reduce((a,u)=>a+u.value,0)/m.usages.length):0;
        let r=255,g=255-Math.round(255*mean/100),b=255-Math.round(255*mean/100);
        html+=`<div style="display:flex;align-items:center;margin:3px 0;">
          <span style="min-width:170px;text-align:right;margin-right:10px;font-family:monospace;font-size:0.72em;">${escapeHtml(label)}:</span>
          <div style="height:14px;border-radius:6px;background:rgb(${r},${g},${b});width:${barLen}px;" title="mean ${mean}%"></div>
        </div>`;
    }
    html+='</div></div>';
    return html;
}
function buildDiffSection(beforeMeta,afterMeta,maxDiff,title){
    let html=`<div style="flex:1;min-width:250px;"><div style="font-weight:bold;text-align:center;margin-bottom:6px;">${escapeHtml(title)}</div><div>`;
    for(let i=0;i<beforeMeta.length;i++){
        let b=beforeMeta[i], a=afterMeta[i];
        let diff=a.count-b.count;
        let barLen=maxDiff===0?0:Math.round((Math.abs(diff)/maxDiff)*380);
        if(barLen<6 && diff!==0) barLen=6;
        let cls=diff>0?'#aafaa5':(diff<0?'#faa':'#ddd');
        let label=`${b.kind}${b.kind==="FixedBlockPage"?'['+b.name+']':(b.name?' '+b.name:'')}`;
        let sign=diff>0?'+':'';
        html+=`<div style="display:flex;align-items:center;margin:3px 0;">
          <span style="min-width:170px;text-align:right;margin-right:10px;font-family:monospace;font-size:0.72em;">${escapeHtml(label)}</span>
          <div style="height:14px;border-radius:6px;background:${cls};width:${barLen}px;" title="diff ${diff}"></div>
          <span style="margin-left:6px;font-size:0.72em;color:#1976d2;">${sign}${diff}</span>
        </div>`;
    }
    html+='</div></div>';
    return html;
}
function showInfoPopup(info){
    const popup=document.createElement('div');
    popup.className='info-popup';
    popup.style.left=(window.innerWidth*0.55+Math.random()*60)+"px";
    popup.style.top=(200+Math.random()*100)+"px";
    popup.innerHTML=`
      <div class="info-popup-header">Page Info
        <button class="close-btn" onclick="this.closest('.info-popup').remove()">&times;</button>
      </div>
      <div>
        Kind: <b>${escapeHtml(info.kind)}</b><br>
        Name: <b>${escapeHtml(info.name)}</b><br>
        Index: <b>${info.index}</b><br>
        Occupancy: <b>${info.percent}%</b><br>
        GC: <b>${escapeHtml(info.gcIdx)}</b> (${escapeHtml(info.when)})<br>
        Mode: <b>${info.optimized?'Simulated Compacted':'Original'}</b>
      </div>`;
    document.body.appendChild(popup);
    makeMovable(popup,popup.querySelector('.info-popup-header'));
}

/* ===== Correlation Panel ===== */
function buildCorrelationPanel(){
    const panel=document.getElementById('correlation-rows');
    if(gcPairs.length===0 && heapGcMarkers.length===0){
        return;
    }
    let html="";
    const gcIndices=gcPairs.map(p=>p.idx).sort((a,b)=>a-b);
    if(gcIndices.length && heapGcMarkers.length){
        gcIndices.forEach((idx,pos)=>{
            if(pos < heapGcMarkers.length){
                html+=`<div class="corr-row" data-gc="${idx}">GC ${idx} <span class="inline-badge">heap@${heapGcMarkers[pos]}</span></div>`;
            } else {
                html+=`<div class="corr-row" data-gc="${idx}">GC ${idx} <span class="inline-badge" style="background:#999">no marker</span></div>`;
            }
        });
    } else if(gcIndices.length){
        html+="<div><b>GC indices:</b></div>";
        gcIndices.forEach(idx=>{
            html+=`<div class="corr-row" data-gc="${idx}">GC ${idx}</div>`;
        });
    } else {
        html+="<div><b>Heap GC markers:</b></div>";
        heapGcMarkers.forEach((s,i)=>{
            html+=`<div class="corr-row" data-marker="${i}">Marker ${i+1} @ sample ${s}</div>`;
        });
    }
    panel.innerHTML=html;
    panel.querySelectorAll('.corr-row').forEach(row=>{
        row.onclick=()=>{
            panel.querySelectorAll('.corr-row').forEach(r=>r.classList.remove('active'));
            row.classList.add('active');
            const gcIdx=row.getAttribute('data-gc');
            if(gcIdx){
                highlightAndFocusHeapMarker(parseInt(gcIdx));
                jumpToHeapTimeline();
                scrollToGCPair(parseInt(gcIdx));
            } else {
                const m=row.getAttribute('data-marker');
                if(m!==null){
                    highlightAndFocusHeapMarkerByPosition(parseInt(m));
                    jumpToHeapTimeline();
                }
            }
        };
    });
}
function scrollToGCPair(idx){
    const wrappers=[...document.querySelectorAll('.gc-pair-wrapper')];
    for(const w of wrappers){
        if(w.querySelector('.gc-summary-title')?.textContent.includes(`GC ${idx}`)){
            w.scrollIntoView({behavior:'smooth', block:'center'});
            w.style.outline='3px solid #1976d2';
            setTimeout(()=>w.style.outline='',1600);
            break;
        }
    }
}

/* ===== Downsampling ===== */
function downsampleBucket(x,y,target,forceSet){
    const n=x.length;
    if(n<=target) return {x,y};
    const bucketCount=Math.min(target,n);
    const bucketSize=n/bucketCount;
    const chosen=new Set();
    chosen.add(0); chosen.add(n-1);
    for(let b=0;b<bucketCount;b++){
        const start=Math.floor(b*bucketSize);
        const end=Math.min(n-1,Math.floor((b+1)*bucketSize));
        if(end<=start) continue;
        let minIdx=start,maxIdx=start;
        let minVal=y[start],maxVal=y[start];
        for(let i=start+1;i<=end;i++){
            if(y[i]<minVal){minVal=y[i];minIdx=i;}
            if(y[i]>maxVal){maxVal=y[i];maxIdx=i;}
        }
        chosen.add(minIdx); chosen.add(maxIdx);
    }
    forceSet.forEach(idx=>chosen.add(idx-1));
    const sorted=[...chosen].sort((a,b)=>a-b);
    return {x:sorted.map(i=>x[i]), y:sorted.map(i=>y[i])};
}
function downsampleLTTB(x,y,target,forceSet){
    const n=x.length;
    if(n<=target) return {x,y};
    const keep=new Set();
    keep.add(0); keep.add(n-1);
    forceSet.forEach(idx=>keep.add(idx-1));
    const base=keep.size;
    let remaining=target-base;
    if(remaining<=0){
        const sorted=[...keep].sort((a,b)=>a-b);
        return {x:sorted.map(i=>x[i]), y:sorted.map(i=>y[i])};
    }
    const buckets=remaining;
    const bucketSize=(n-2)/buckets;
    let a=0;
    for(let i=0;i<buckets;i++){
        const rangeStart=Math.floor(i*bucketSize)+1;
        const rangeEnd=Math.floor((i+1)*bucketSize)+1;
        if(rangeEnd>=n-1) break;
        let maxArea=-1, chosen=rangeStart;
        const avgRangeEnd=Math.floor((i+2)*bucketSize)+1;
        const avgRangeStart=Math.floor((i+1)*bucketSize)+1;
        const avgEnd=Math.min(n-1,avgRangeEnd);
        const avgStart=Math.min(n-1,avgRangeStart);
        let avgX=0,avgY=0,count=0;
        for(let j=avgStart;j<avgEnd;j++){avgX+=x[j];avgY+=y[j];count++;}
        if(count===0){avgX=x[rangeEnd];avgY=y[rangeEnd];count=1;}
        avgX/=count; avgY/=count;
        for(let j=rangeStart;j<rangeEnd;j++){
            const area=Math.abs((x[a]-avgX)*(y[j]-y[a]) - (x[a]-x[j])*(avgY-y[a]));
            if(area>maxArea){maxArea=area; chosen=j;}
        }
        keep.add(chosen);
        a=chosen;
    }
    const sorted=[...keep].sort((a,b)=>a-b);
    return {x:sorted.map(i=>x[i]), y:sorted.map(i=>y[i])};
}
function applyDownsampling(algo,target){
    lastAlgo=algo; lastTarget=target;
    const n=heapValuesOriginal.length;
    const xArr=Array.from({length:n},(_,i)=>i+1);
    const forceSet=new Set(heapGcMarkers);
    let result=(algo==='lttb')?downsampleLTTB(xArr,heapValuesOriginal,target,forceSet):downsampleBucket(xArr,heapValuesOriginal,target,forceSet);
    dsCurrentX=result.x;
    dsCurrentY=result.y;
    dsActive=true;
    updateDsInfo();
    renderHeapPlot();
}
function revertToOriginal(){
    dsActive=false;
    updateDsInfo();
    renderHeapPlot();
}
function updateDsInfo(){
    const badge=document.getElementById('ds-info');
    if(!badge) return;
    if(heapValuesOriginal.length===0){
        badge.textContent="No data";
        return;
    }
    if(!dsActive){
        badge.textContent=`Original: ${heapValuesOriginal.length} pts`;
        badge.style.background="#555";
    } else {
        badge.textContent=`Downsampled: ${dsCurrentX.length}/${heapValuesOriginal.length} pts`;
        badge.style.background="#1976d2";
    }
}

/* ===== Plot Rendering ===== */
function renderHeapPlot(){
    const xLine=dsActive?dsCurrentX:Array.from({length:heapValuesOriginal.length},(_,i)=>i+1);
    const yLine=dsActive?dsCurrentY:heapValuesOriginal;

    const actualTrace={
        x:xLine,y:yLine,type:'scatter',mode:'lines',
        name: dsActive? `Heap Bytes (downsampled ${dsCurrentX.length})`:'Heap Bytes',
        line:{color:'#1976d2',width:2}
    };
    const markerTrace={
        x:heapGcMarkers,y:heapGcMarkerValues,type:'scatter',mode:'markers',
        name:'GC events',
        marker:{symbol:'star-diamond',size:9,color:'red',line:{color:'#000',width:1}},
        text:heapGcMarkers.map((idx,i)=>`GC event #${i+1} @ sample ${idx}<br>Heap: ${heapGcMarkerRawValues[i]}`),
        hoverinfo:'text'
    };

    let traces=[actualTrace,markerTrace];

    if(haveSimulation && simulatedCompactedX.length){
        traces.push({
            x:simulatedCompactedX,
            y:simulatedCompactedY,
            type:'scatter',
            mode:'lines+markers',
            name:'Simulated Compacted Heap',
            line:{color:'#ff9800',width:2,dash:'dot'},
            marker:{symbol:'circle',size:7,color:'#ff9800',line:{color:'#333',width:1}},
            text:simulatedCompactedY.map((v,i)=>`Simulated after GC#${i+1} @ sample ${simulatedCompactedX[i]}<br>${formatBytes(v)}`),
            hoverinfo:'text'
        });
    }

    Plotly.newPlot('heap-chart',traces,{
        title:'Heap Usage Over Time',
        xaxis:{title:'Sample Index'},
        yaxis:{title:'Heap Bytes'},
        legend:{orientation:'h',x:0,y:1.05}
    });
    plotRendered=true;
}
function updateSimulatedLine(){ renderHeapPlot(); }

/* ===== Highlight / Focus ===== */
function highlightHeapMarker(gcIdx){
    if(!plotRendered) return;
    const sorted=gcPairs.map(p=>p.idx).sort((a,b)=>a-b);
    const pos=sorted.indexOf(gcIdx);
    if(pos<0 || pos>=heapGcMarkers.length) return;
    highlightHeapMarkerByPosition(pos);
}
function highlightHeapMarkerByPosition(pos){
    if(!plotRendered) return;
    const sizes=heapGcMarkers.map((_,i)=> i===pos?16:9);
    Plotly.restyle('heap-chart',{'marker.size':[sizes]},1);
    const ann={
        x:heapGcMarkers[pos], y:heapGcMarkerValues[pos],
        text:`GC#${pos+1}`, showarrow:true, arrowhead:7, ax:0, ay:-40,
        bgcolor:'#1976d2', font:{color:'#fff',size:10}
    };
    Plotly.relayout('heap-chart',{annotations:[ann]});
}
function focusOnHeapMarker(sampleIndex){
    if(!plotRendered) return;
    const total=heapValuesOriginal.length;
    const windowSize=Math.max(50,Math.round(total*0.05));
    let start=sampleIndex - Math.floor(windowSize/2);
    let end=sampleIndex + Math.floor(windowSize/2);
    if(start<1){ end+=(1-start); start=1; }
    if(end>total){ let diff=end-total; start=Math.max(1,start-diff); end=total; }
    Plotly.relayout('heap-chart',{'xaxis.range':[start,end]});
}
function highlightAndFocusHeapMarker(gcIdx){
    highlightHeapMarker(gcIdx);
    const sorted=gcPairs.map(p=>p.idx).sort((a,b)=>a-b);
    const pos=sorted.indexOf(gcIdx);
    if(pos<0 || pos>=heapGcMarkers.length) return;
    focusOnHeapMarker(heapGcMarkers[pos]);
}
function highlightAndFocusHeapMarkerByPosition(pos){
    highlightHeapMarkerByPosition(pos);
    if(pos<0 || pos>=heapGcMarkers.length) return;
    focusOnHeapMarker(heapGcMarkers[pos]);
}
function jumpToHeapTimeline(){
    const chart=document.getElementById('heap-chart');
    if(chart){
        chart.scrollIntoView({behavior:'smooth', block:'center'});
    }
}

/* ===== File Handler (Merged) ===== */
document.getElementById('merged-input').addEventListener('change', e=>{
    const file=e.target.files[0];
    if(!file) return;
    document.getElementById('merged-file-name').textContent=file.name;
    const reader=new FileReader();
    reader.onload=ev=>{
        parseMergedFile(ev.target.result);
    };
    reader.readAsText(file);
});

/* ===== Downsampling Controls ===== */
document.getElementById('apply-ds-btn').addEventListener('click', ()=>{
    const target=parseInt(document.getElementById('ds-target').value,10);
    const algo=document.getElementById('ds-algo').value;
    if(isNaN(target)||target<100){ alert("Please enter a target >= 100."); return; }
    if(heapValuesOriginal.length===0){ alert("Load merged file first."); return; }
    applyDownsampling(algo,target);
    document.getElementById('toggle-original-btn').textContent="Show Original";
});
document.getElementById('toggle-original-btn').addEventListener('click', ()=>{
    if(heapValuesOriginal.length===0) return;
    if(dsActive){
        revertToOriginal();
        document.getElementById('toggle-original-btn').textContent="Show Downsampled";
    } else {
        applyDownsampling(lastAlgo,lastTarget);
        document.getElementById('toggle-original-btn').textContent="Show Original";
    }
});

/* Init */
updateDsInfo();
buildCorrelationPanel();