const SHEET_ID = '1nYJJJNJTLU19mBNm3Sjwo_Ep54AZPQl-PCS6koLFe84';
const SHEET_NAME = '菜單品項';
const WORLDS = {
  CAFE:{id:'CAFE',tab:'午後咖啡',theme:'cafe',eyebrow:'AFTERNOON COFFEE',title:'浮世繪浪花・午後咖啡',description:'以咖啡、甜點與較安靜的節奏迎接相遇。',facts:['14:00–20:00','低消 NT$350／90 分鐘','10% 服務費','主餐供應至 20:00'],scene:'/assets/images/menu/cafe.webp',note:'主食加購飲品可折 NT$50（冷萃咖啡／冰滴酒香不適用）；主食加購飲品及拍立得，可折 NT$100。'},
  BAR:{id:'BAR',tab:'魔幻夜晚',theme:'bar',eyebrow:'NIGHT SNOW BAR',title:'浮世繪夜雪・魔幻酒吧',description:'冰、酒與燈影喚醒魔幻的夜間狀態。',facts:['20:00–02:00','低消 NT$500／90 分鐘','10% 服務費','包廂 NT$1,000／小時'],scene:'/assets/images/menu/bar.webp',note:'破杯費 NT$500｜清潔費 NT$5,000｜隱藏品項請詢問現場。未滿十八歲禁止飲酒，飲酒過量有害健康。'},
  COLLECTION:{id:'COLLECTION',tab:'浮世繪／周邊',theme:'collection',eyebrow:'UKIYO-E COLLECTION',title:'櫻花收藏・浮世繪與周邊',description:'拍立得、手機拍攝、豪華拍攝與限定互動，將相遇留成收藏。',facts:['午後與夜間皆有不同篇章','價格以姶仕設定及現場說明為準','線上購拍完成後不得取消'],scene:'/assets/images/menu/collection.webp',note:'午後茶飲／壺可抵一節低消；夜間若擔心姶仕喝醉，調酒 Shot 可製作無酒精版本。'}
};

function parseCSV(text) {
  const rows=[]; let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i+=1){const c=text[i],n=text[i+1];if(c==='"'&&quote&&n==='"'){cell+='"';i+=1;continue}if(c==='"'){quote=!quote;continue}if(c===','&&!quote){row.push(cell);cell='';continue}if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&n==='\n')i+=1;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';continue}cell+=c}row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
function price(row,index){const preview=(row[index['官網顯示預覽']]||'').trim();if(preview)return preview;const text=(row[index['價格文字']]||'').trim();if(text)return text;const number=(row[index['價格數字']]||'').trim();return number?`NT$${number}`:'請詢問現場'}

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=1800');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&t=${Date.now()}`;
    const response=await fetch(url,{headers:{'user-agent':'MagicOffice/4.3'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error(`Google Sheets ${response.status}`);
    const text=await response.text();
    if(!text.includes('品項 ID')||text.includes('<html'))throw new Error('Menu sheet is not publicly readable');
    const rows=parseCSV(text);const headerIndex=rows.findIndex(row=>row.includes('品項 ID')&&row.includes('世界代碼'));if(headerIndex<0)throw new Error('Menu header not found');
    const headers=rows[headerIndex].map(v=>v.trim());const index=Object.fromEntries(headers.map((v,i)=>[v,i]));
    const items=rows.slice(headerIndex+1).map(row=>({id:(row[index['品項 ID']]||'').trim(),world:(row[index['世界代碼']]||'').trim(),categoryId:(row[index['分類代碼']]||'').trim(),category:(row[index['分類名稱']]||'').trim(),name:(row[index['品項名稱']]||'').trim(),description:(row[index['品項說明']]||'').trim(),price:price(row,index),status:(row[index['狀態']]||'').trim(),order:Number(String(row[index['排序']]||'999').replace(/,/g,''))})).filter(item=>item.id&&item.name&&item.status!=='隱藏'&&WORLDS[item.world]);
    if(items.length<20)throw new Error(`Menu item count too low: ${items.length}`);
    const worlds=Object.values(WORLDS).map(meta=>{const worldItems=items.filter(item=>item.world===meta.id);const categoryMap=new Map();for(const item of worldItems){if(!categoryMap.has(item.categoryId))categoryMap.set(item.categoryId,{id:item.categoryId,name:item.category||item.categoryId,items:[]});categoryMap.get(item.categoryId).items.push([item.name,item.price,item.description,item.order])}const categories=[...categoryMap.values()].map(category=>({...category,items:category.items.sort((a,b)=>a[3]-b[3]).map(([name,p,description])=>[name,p,description])}));return {...meta,categories}});
    res.status(200).json({ok:true,source:'即時同步',updatedAt:new Date().toISOString(),worlds});
  }catch(error){res.status(503).json({ok:false,source:'unavailable',message:String(error.message||error)})}
};
