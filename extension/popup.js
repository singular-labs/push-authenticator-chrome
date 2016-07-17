"use strict";

function openGooglePlay(){
    var newURL = "https://play.google.com/store/apps/details?id=net.singular.authenticator";
    chrome.tabs.create({ url: newURL });
}

function renderStatus(statusText) {
    document.getElementById('status').textContent = statusText;
}

function debug(msg){
    console.log("popup.js: " + msg);
}

function sendBackgroundMessage(message){
    debug("sendBackgroundMessage: started");
    chrome.extension.sendMessage(message, function(response) {
        debug("sendBackgroundMessage: done");
    });
}

function getUI() {
    sendBackgroundMessage({command: "getUI"});
}

function reset() {
    sendBackgroundMessage({command: "resetState"});
    window.close();
}

function getCode(id) {
    sendBackgroundMessage({command: "getCode", id: id});
}

document.addEventListener('DOMContentLoaded', function() {
    debug("DOMContentLoaded");
    renderStatus("init");
    document.getElementById("google_play_link").onclick = openGooglePlay;
    document.getElementById("reset").onclick = reset;
    getUI();
});

function handleState(state){
    if(state.step == "init"){
        $("#qr_code").show();
        var pair_message = {registrationId: state.localRegistrationId, PSK: state.psk};
        var encoded_message = JSON.stringify(pair_message);
        var qrcode_src = "https://chart.googleapis.com/chart?cht=qr&chs=320x320&chl=" + encodeURIComponent(encoded_message);
        $("#qr_code_img").attr("src", qrcode_src);
    }else{
        $("#qr_code").hide();
    }
    if(state.step == "loaded"){
        $("#accounts_table").empty();
        state.accounts.forEach(function(currentValue,index,arr){
            var element_id = "li_" + currentValue.id;
            $("#accounts_table").append("<tr style=\"cursor: pointer;\" id=\"" + element_id + "\"><td>" + currentValue.name + "</td></tr>");
            document.getElementById(element_id).onclick = function(){getCode(currentValue.id)};
        });
    }
    renderStatus(state.statusMessage);
}

chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        var command = request.command;
        debug(`onMessage: command = ${command}`);
        if (command == "drawState"){
            debug("state = " + request.state);
            handleState(request.state);
        }
        sendResponse({success: true});
    });