// ---------- Shared color utilities ----------
function setAccent(hex){
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-soft', hex+'22');
}
function hexToRgb(hex){
  hex = hex.replace('#','');
  const bigint = parseInt(hex,16);
  return {r:(bigint>>16)&255, g:(bigint>>8)&255, b:bigint&255};
}
function rgbToHex(r,g,b){
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}
  else{
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h/=6;
  }
  return {h:Math.round(h*360), s:Math.round(s*100), l:Math.round(l*100)};
}
function hslToRgb(h,s,l){
  h/=360; s/=100; l/=100;
  let r,g,b;
  if(s===0){r=g=b=l;}
  else{
    const hue2rgb=(p,q,t)=>{
      if(t<0)t+=1; if(t>1)t-=1;
      if(t<1/6) return p+(q-p)*6*t;
      if(t<1/2) return q;
      if(t<2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r=hue2rgb(p,q,h+1/3);
    g=hue2rgb(p,q,h);
    b=hue2rgb(p,q,h-1/3);
  }
  return {r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255)};
}
function copyText(text, el){
  navigator.clipboard.writeText(text).then(()=>{
    if(el){ el.classList.add('copied'); setTimeout(()=>el.classList.remove('copied'),900); }
  });
}
function relLuminance(hex){
  const {r,g,b} = hexToRgb(hex);
  const [R,G,B] = [r,g,b].map(v=>{
    v/=255;
    return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  });
  return 0.2126*R + 0.7152*G + 0.0722*B;
}
const NAMED_COLORS = [
  ['Coral','#FF7F50'],['Salmon','#FA8072'],['Tomato','#FF6347'],['Crimson','#DC143C'],
  ['Firebrick','#B22222'],['Peach','#FFDAB9'],['Sand','#C2B280'],['Khaki','#F0E68C'],
  ['Gold','#FFD700'],['Amber','#FFBF00'],['Orange','#FFA500'],['Terracotta','#E2725B'],
  ['Rust','#B7410E'],['Olive','#808000'],['Moss','#8A9A5B'],['Forest Green','#228B22'],
  ['Sea Green','#2E8B57'],['Mint','#98FF98'],['Teal','#008080'],['Turquoise','#40E0D0'],
  ['Sky Blue','#87CEEB'],['Cornflower','#6495ED'],['Royal Blue','#4169E1'],['Navy','#000080'],
  ['Indigo','#4B0082'],['Violet','#8F00FF'],['Lavender','#E6E6FA'],['Plum','#DDA0DD'],
  ['Orchid','#DA70D6'],['Magenta','#FF00FF'],['Pink','#FFC0CB'],['Hot Pink','#FF69B4'],
  ['Beige','#F5F5DC'],['Ivory','#FFFFF0'],['Charcoal','#36454F'],['Slate','#708090'],
  ['Graphite','#383838'],['Chocolate','#D2691E'],['Sienna','#A0522D'],['Taupe','#483C32'],
];
function nearestColorName(hex){
  const {r,g,b} = hexToRgb(hex);
  let best=null, bestDist=Infinity;
  NAMED_COLORS.forEach(([name,nhex])=>{
    const nc = hexToRgb(nhex);
    const dist = (r-nc.r)**2 + (g-nc.g)**2 + (b-nc.b)**2;
    if(dist<bestDist){bestDist=dist; best={name,hex:nhex};}
  });
  return best;
}
