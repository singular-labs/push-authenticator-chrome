"use strict";

var registration_id = null;
var state = null;
var last_gcm_message = null;
var last_extension_message = null;
var waiting_for_code = false;
const senderId = "819389492169";
const PROTOCOL_VERSION = 1;

function debug(msg){
    console.log(msg);
}

function runCallback(callback){
    if(callback)
        callback();
}

function encryptMessage(psk, message){
    var encodedMessage = JSON.stringify(message);
    var param = { // Java does not accepts the default 4 word size
        iv: sjcl.random.randomWords(3, 0)
    };
    return sjcl.encrypt(psk, encodedMessage, param);
}

function decryptMessage(psk, encryptedMessage){
    encryptedMessage = encryptedMessage.replace(/\\/g,"");
    var encodedMessage = sjcl.decrypt(psk, encryptedMessage);
    return JSON.parse(encodedMessage);
}

function sendGCMMessage(state, message){
    debug("sendGCMMessage: message = " + JSON.stringify(message));
    var data = {
        "from": state.localRegistrationId,
        "version": PROTOCOL_VERSION,
        "message": encryptMessage(state.psk, message),
        "to": state.remoteRegistrationId
    };
    debug("sendGCMMessage: data = " + JSON.stringify(data));
    $.post({
        url: "https://twofactor.singular.net/two_factor_router",
        data: JSON.stringify(data),
        success: function (response) {debug("sendGCMMessage: response = " + response);},
        dataType: "json",
        contentType: "application/json"});
}

function getCode(state, id) {
    var message = {"command": "getCode", "id": id};
    sendGCMMessage(state, message);
}

function generateSharedKey(){
    var randomWords = sjcl.random.randomWords(16);
    var output = "";
    for(var i=0; i<16; i++){
        output += String.fromCharCode(Math.abs(randomWords[i] & 0xff));
    }
    return btoa(output);
}

function copy(text) {
    debug(`copy: copy ${text} to clipboard`);
    var input = document.createElement('textarea');
    document.body.appendChild(input);
    input.value = text;
    input.focus();
    input.select();
    document.execCommand('Copy');
    input.remove();
}

function initGCM(callback = null) {
    chrome.storage.local.get("registrationId", function(result) {
        // If already registered, bail out.
        if (result["registrationId"]){
            registration_id = result["registrationId"];
            debug("initGCM: registered, registration_id = " + registration_id);
            runCallback(callback);
        }else{
            debug("initGCM: registration in progress");
            // Up to 100 senders are allowed.
            var senderIds = [senderId];
            chrome.gcm.register(senderIds, function(registrationId){
                if (chrome.runtime.lastError) {
                    debug("initGCM: registration error, try again later");
                    // When the registration fails, handle the error and retry the
                    // registration later.
                    return;
                }
                debug("initGCM: registration done");
                chrome.storage.local.set({registrationId: registrationId});
                registration_id = registrationId;
                runCallback(callback);
            });
        }
    });
}

function initState(callback){
    chrome.storage.local.get("state", function(result) {
        if (result["state"]){
            state = JSON.parse(result["state"]);
            debug('initState: loaded saved state = ' + result["state"]);
            runCallback(callback);
        }else{
            resetState(callback);
        }
    });
}

function initCallbacks(callback){
    chrome.gcm.onMessage.addListener(handleGCMMessage);
    chrome.extension.onMessage.addListener(handleExtensionMessage);
    runCallback(callback);
}

function saveState(callback){
    chrome.storage.local.set({state: JSON.stringify(state)}, function(){
        runCallback(callback);
    });
}

function updateUI(){
    chrome.extension.sendMessage({command: "drawState", state: state}, function(response) {
        debug("updateUI: done");
    });
}

function resetState(callback){
    state = {};
    debug("resetState: new state");
    state.step = "init";
    state.localRegistrationId = JSON.stringify({protocol: "gcm", address: registration_id});
    state.statusMessage = "";
    state.psk = generateSharedKey();
    saveState(callback);
    updateUI();
}

function getAccounts(){
    var message = {"command": "getAccounts"};
    sendGCMMessage(state, message);
    updateStatusMessage("paired, waiting for accounts");
}

function handleGCMMessage(message) {
    debug("handleGCMMessage: got message = " + JSON.stringify(message));
    var encryptedValue = message.data.value;
    var version = message.data.version;
    if (version > PROTOCOL_VERSION){
        debug(`handleGCMMessage: protocol version is outdated, got message with version = ${version},
         while we support version ${PROTOCOL_VERSION}`);
        updateStatusMessage("Please update your chrome extension");
        return;
    }
    debug("encryptedValue = " + encryptedValue);
    var value = decryptMessage(state.psk, encryptedValue);
    switch(value.command){
        case "Hello":
            debug("handleGCMMessage: handle hello!");
            state.step = "paired";
            state.remoteRegistrationId = message.data.src;
            saveState();
            getAccounts();
            break;
        case "accountList":
            debug("handleGCMMessage: handle accountList");
            state.step = "loaded";
            state.accounts = value.accounts;
            updateStatusMessage("Select account");
            saveState();
            break;
        case "code":
            debug("handleGCMMessage: handle code");
            if(waiting_for_code){
                copy(value.value);
                waiting_for_code = false;
                updateStatusMessage("Code copied :)");
            }else{
                debug("got code but was not waiting for one...");
            }
            break;
        case "reject":
            debug("handleGCMMessage: handle reject");
            if(waiting_for_code){
                waiting_for_code = false;
                updateStatusMessage("Reject :(");
            }else{
                debug("got reject but was not waiting for one...");
            }
            break;
    }
    last_gcm_message = message;
}

function updateStatusMessage(new_message){
    state.statusMessage = new_message;
    updateUI();
}

function handleExtensionMessage(request, sender, sendResponse){
    last_extension_message = request;
    console.log("handleExtensionMessage: command = " + request.command);
    if (request.command == "getUI") {
        updateUI();
    }
    else if (request.command == "getCode") {
        waiting_for_code = true;
        getCode(state, request.id);
        updateStatusMessage("waiting for code");
    }
    else if (request.command == "resetState") {
        resetState();
    }
    sendResponse({});
}

initGCM(function(){
   initState(function(){
       initCallbacks(function(){
           debug("init done!");
           if(state.step == "paired" || state.step == "loaded"){
               getAccounts();
           }
           updateUI();
       })
   })
});