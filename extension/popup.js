"use strict";

function openGooglePlay(){
    var newURL = "https://play.google.com/store/apps/details?id=net.singular.authenticator";
    chrome.tabs.create({ url: newURL });
}

function renderStatus(toastType, statusText) {
    toastr.clear();
    toastr.options = {
        "closeButton": false,
        "debug": false,
        "newestOnTop": false,
        "progressBar": false,
        "positionClass": "toast-bottom-right",
        "preventDuplicates": false,
        "onclick": null,
        "showDuration": "300",
        "hideDuration": "1000",
        "timeOut": "8000",
        "extendedTimeOut": "1000",
        "showEasing": "swing",
        "hideEasing": "linear",
        "showMethod": "fadeIn",
        "hideMethod": "fadeOut"
    };
    toastr[toastType](statusText);
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
    document.getElementById("google_play_link").onclick = openGooglePlay;
    document.getElementById("reset").onclick = reset;
    getUI();
});

function handleState(state){
    if(state.step == "init"){
        $("#qr_code").show();
        $("#accounts").hide();
        var pair_message = {registrationId: state.localRegistrationId, PSK: state.psk};
        var encoded_message = JSON.stringify(pair_message);
        var qrcode_src = "https://chart.googleapis.com/chart?cht=qr&chs=320x320&chl=" + encodeURIComponent(encoded_message);
        $("#qr_code_img").attr("src", qrcode_src);
    }else{
        $("#qr_code").hide();
        $("#accounts").show();
    }
    if(state.step == "loaded"){
        $("#accounts_table").empty();
        if(state.accounts.length == 0){
            $("#accounts_table").append("<tr style=\"cursor: pointer;\"><td><span style=\"margin-left:15px;\">No accounts configured</span></td></tr>");
        }
        state.accounts.forEach(function(currentValue,index,arr){
            var element_id = "li_" + currentValue.id;
            $("#accounts_table").append("<tr style=\"cursor: pointer;\" id=\"" + element_id + "\"><td><span style=\"margin-left:15px;\">" + currentValue.name + "</span></td></tr>");
            document.getElementById(element_id).onclick = function(){getCode(currentValue.id)};
        });
    }
}

chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        var command = request.command;
        debug(`onMessage: command = ${command}`);
        if (command == "drawState"){
            debug("state = " + request.state);
            handleState(request.state);
        }
        if (command == "updateStatus"){
            debug("status = " + request.status);
            var toastType = request.toastType;
            renderStatus(toastType, request.status);
        }
        sendResponse({success: true});
    });