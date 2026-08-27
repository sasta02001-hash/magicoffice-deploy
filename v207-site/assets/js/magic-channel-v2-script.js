
(function(){
  'use strict';
  var schedulePhrases=[
    ['臨時異動以官方 Instagram 公告為準','本頁公告為出勤資訊唯一正式版本'],
    ['臨時異動以官方 IG 公告為準','本頁公告為出勤資訊唯一正式版本'],
    ['以官方 Instagram 公告為準','以本頁最新公告為準'],
    ['以官方 IG 公告為準','以本頁最新公告為準']
  ];
  function normalizeScheduleSource(){
    var node=document.getElementById('schedule-summary');
    if(!node){return;}
    var next=node.textContent||'';
    schedulePhrases.forEach(function(pair){next=next.split(pair[0]).join(pair[1]);});
    if(next!==node.textContent){node.textContent=next;}
  }
  function startScheduleGuard(){
    normalizeScheduleSource();
    var node=document.getElementById('schedule-summary');
    if(node&&'MutationObserver' in window){
      new MutationObserver(normalizeScheduleSource).observe(node,{childList:true,characterData:true,subtree:true});
    }
  }
  document.querySelectorAll('a[data-line-source]').forEach(function(link){
    link.addEventListener('click',function(){
      var source=link.getAttribute('data-line-source')||'unknown';
      try{window.sessionStorage.setItem('magicoffice_last_line_source',source);}catch(error){}
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event:'line_official_click',line_source:source,page_location:window.location.href});
    });
  });
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',startScheduleGuard,{once:true});
  }else{
    startScheduleGuard();
  }
})();
