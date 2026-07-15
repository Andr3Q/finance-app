window.__installPrompt=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;});
if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(function(reg){if(reg)reg.update();});navigator.serviceWorker.addEventListener('controllerchange',function(){window.location.reload();});});}
