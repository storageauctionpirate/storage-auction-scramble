// Unit ladder loader: level (1-200) -> image. Falls back to nearest available LOWER level, else lowest available.
var UNIT_LADDER=(function(){
 var MAX=200,avail=[],embedded={},base="units-ladder/";
 function pad(n){return ("00"+n).slice(-3);}
 function init(o){o=o||{};avail=(o.available||[]).slice().sort(function(a,b){return a-b;});embedded=o.embedded||{};if(o.base!=null)base=o.base;}
 function resolve(level){level=Math.max(1,Math.min(MAX,level|0));if(!avail.length)return null;var best=avail[0];for(var i=0;i<avail.length;i++){if(avail[i]<=level)best=avail[i];else break;}return best;}
 function src(level){var l=resolve(level);if(l==null)return "";return embedded[l]||(base+"unit"+pad(l)+".jpg");}
 function tierOf(level){return level<=20?1:level<=50?2:level<=90?3:level<=130?4:level<=170?5:level<=199?6:7;}
 var TIERS=[null,[1,20,"Trash"],[21,50,"Household"],[51,90,"Furniture & Tools"],[91,130,"Collectibles"],[131,170,"High-Value"],[171,199,"Rare Luxury"],[200,200,"Legendary"]];
 function load(url,cb){fetch(url).then(function(r){return r.json();}).then(function(m){init({available:m.available});cb&&cb(null,m);}).catch(function(e){cb&&cb(e);});}
 return {MAX:MAX,init:init,resolve:resolve,src:src,tierOf:tierOf,TIERS:TIERS,load:load,file:function(l){return "unit"+pad(l)+".jpg";}};
})();
if(typeof module!=="undefined")module.exports=UNIT_LADDER;
