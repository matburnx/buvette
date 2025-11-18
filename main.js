import puppeteer from "puppeteer";
import {user,pass, second_user, third_user} from "./creds.js";
import { argv, exit } from "node:process";

const date = new Date();
let str_date = String(date.getDate()+1)+"/"+String(date.getMonth()+1)+"/"+String(date.getFullYear());
let username = user;
let username2 = second_user;
let username3 = third_user;
let password = pass;
const URL = "https://buresa.sorbonne-universite.fr/";
const USERNAME_SELECTOR = "#tbLogin";
const PASSWORD_SELECTOR = "#tbPassword";
const BUTTON_SELECTOR = "#BtnConnect";

const BU_LIST_SELECTOR = "#liste_site";

const BDL_PICKER = "2";
const BDL1_PICKER = "3";
const BCPR_PICKER = "5";
const GEOS_PICKER = "6";
const MIR_PICKER = "7";
const PICKERS = [BDL_PICKER,BDL1_PICKER,BCPR_PICKER,GEOS_PICKER,MIR_PICKER];
let picker = GEOS_PICKER; //default BU is GEOS

const DAY_LIST_SELECTOR = "#datepicker";
const SEARCH_BUTTON = "#button_search";

const NUMBER_OF_PLACES_SELECTOR = "#ContentPlaceHolder1_ddlPlaces";
const THREE_PLACES_OPTION = "3";
const FILTER_BUTTON = "#ContentPlaceHolder1_btnSearch";

const ROOMS_BODY = "#ContentPlaceHolder1_Repeater1";
const NUMBER_OF_TD = 14;
const NUMBER_OF_TR = 2; 

const HOURS_SELECTOR = "#ContentPlaceHolder1_heure_droite";
const SECOND_PERSON_SELECTOR = "#ContentPlaceHolder1_rptNbParticipants_tbValue_1";
const THIRD_PERSON_SELECTOR = "#ContentPlaceHolder1_rptNbParticipants_tbValue_2"; 
const CONDITIONS_CHECKBOX = "#ContentPlaceHolder1_conditions";
const VALIDATE_BUTTON = "#ContentPlaceHolder1_BtnValider";

async function connect_to_site(page) {
    await page.goto(URL);
    await page.setViewport({width: 1080, height: 1024});
    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(username);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(password);

    await page.click(BUTTON_SELECTOR);

    await page.waitForNavigation();
}

async function select_day(page,date = str_date) {
    await page.focus(DAY_LIST_SELECTOR);
    //await page.evaluate( () => document.getElementById(DAY_LIST_SELECTOR.substring(1,DAY_LIST_SELECTOR.length)).value = "")
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(date);
    await page.keyboard.press("Enter");
}

async function select_bu(page,bu_value) {
    await page.focus(BU_LIST_SELECTOR);
    await page.select(BU_LIST_SELECTOR,bu_value);
    await page.waitForNavigation();

    await page.click(SEARCH_BUTTON);
    await page.waitForNavigation();
}

async function search_room(page) {
    await page.select(NUMBER_OF_PLACES_SELECTOR,THREE_PLACES_OPTION);
    await page.click(FILTER_BUTTON);
    await page.waitForNavigation();
}

async function list_availabilities(page) {
    let availabilities = Array();
    let number_of_trs = (await page.$$(ROOMS_BODY+" > tbody:nth-child(1) > tr")).length;
    for (let tbody = 0; tbody < number_of_trs; tbody++) {
        availabilities.push([]);
        for (let tr = 1; tr <= NUMBER_OF_TR ; tr++) {
            for (let td = 1; td <= NUMBER_OF_TD; td++) {
                let hour = 8 + (tr-1)*NUMBER_OF_TD*0.5 + (td-1)*0.5;
                let element = ROOMS_BODY+"_Repeater3_"+String(tbody)+" > tbody:nth-child(1) > tr:nth-child("+tr+") > td:nth-child("+td+") > .StatusFree";
                let elt = await page.$(element);
                if(elt!=null) {
                    availabilities[tbody].push([hour,elt]);
                } 
            }
        }
    }
    //console.log(availabilities);
    return availabilities;
}

async function find_best_interval(availabilities) { 
    let max_length=0; //in half hours
    let first_elt=null;
    let max_elt=null;
    let current_length=0;
    let first_time=8;
    let start_time=first_time;

    for (let i=0; i<availabilities.length;i++) {
        current_length=0;
        if(availabilities.length>0) {
            first_time=availabilities[i][0][0];
            first_elt=availabilities[i][0][1];
        }
        for (let j=1; j <availabilities[i].length;j++) {
            let previous_time = availabilities[i][j-1][0];
            //let previous_elt = availabilities[i][j-1][1];

            let time = availabilities[i][j][0];
            let elt = availabilities[i][j][1];

            if(time-previous_time>0.5) {
                current_length++;
                if(current_length>max_length) {
                    max_length=current_length;
                    start_time=first_time;
                    max_elt=first_elt;
                }
                current_length=0;
                first_time=time;
                first_elt=elt;
            }
            current_length++;
        }
        current_length--;
        if(current_length>max_length) {
            max_length=current_length;
            start_time=first_time;
            max_elt=first_elt;
        }
    }
    console.log("length :",max_length/2);
    console.log("starting hour :",start_time);
    max_length=Math.min(max_length,8);
    return [start_time,max_length,max_elt];
}

function is_valid_format_date(str_date) {
    if (isNaN(str_date[0])) {return false;}
    if (isNaN(str_date[1])) {return false;}
    if (str_date[2]!='/') {return false;}
    if (isNaN(str_date[3])) {return false;}
    if (isNaN(str_date[4])) {return false;}
    if (str_date[5]!='/') {return false;}
    if (isNaN(str_date[6])) {return false;}
    if (isNaN(str_date[7])) {return false;}
    if (isNaN(str_date[8])) {return false;}
    if (isNaN(str_date[9])) {return false;}
    return true;
}

function hours_to_formatted_string(start_time, max_length) {
    let last_hour = start_time + max_length/2;
    let hours = String(Math.floor(last_hour));
    if(hours.length==1) { hours="0"+hours; }

    let minutes = String((last_hour%1)*60);
    if(minutes.length==1) { minutes="0"+minutes; }

    return hours+":"+minutes;
}

async function make_reservation(page, username2, username3=third_user, formatted_hour) {
    await page.focus(SECOND_PERSON_SELECTOR);
    await page.keyboard.type(username2);

    let elt = await page.$(THIRD_PERSON_SELECTOR);
    if (elt!=null) {
        await page.focus(THIRD_PERSON_SELECTOR);
        await page.keyboard.type(username3);
    }

    await page.focus(HOURS_SELECTOR);
    await page.select(HOURS_SELECTOR,formatted_hour);
    await page.click(CONDITIONS_CHECKBOX);
}

for(let i=2; i<argv.length; i++) {
    switch (argv[i]) {
        case "--help":
            console.log("Usage : node main.js [...]")
            console.log("Parameters :");
            console.log("--help                                                         : Print this and exit.");
            console.log("--bu {1...5}                                                   : Select the bu for reservation (same order as the site).");
            console.log("--date <DD/MM/YYYY>                                            : Select the date of reservation.");
            console.log("--password <password>                                          : Give your password.")
            console.log("--user <surname.name@etu.sorbonne-universite.fr>               : Give your username.");
            console.log("--user2 | --user3 <surname.name@etu.sorbonne-universite.fr>    : Give the 2nd/3rd username for the reservation.");
            exit(0);
        case "--bu":
            let val = parseInt(argv[i+1]);
            picker = PICKERS[val-1];
            break;
        case "--date":
            if(is_valid_format_date(argv[i+1])) {
                str_date = argv[i+1];
            } else {
                console.log("Invalid date given, choosing tomorrow.");
            }
            break;
        case "--password":
            password = argv[i+1];
            break;
        case "--user":
            username = argv[i+1];
            break;
        case "--user2":
            username2 = argv[i+1];
            break;
        case "--user3":
            username3 = argv[i+1];
            break;
        default:
            break;
    }
}

//INITIALIZATION
console.log("Browser launching...");
const browser = await puppeteer.launch();
const page = await browser.newPage();

//CONNECTION
console.log("Connecting...");
await connect_to_site(page);

await page.screenshot({ path: "screenshots/logged.png" });

//SELECTION OF BU AND DAY

console.log("Selecting day...");
await select_day(page,str_date);

console.log("Selecting BU...");
await select_bu(page,picker);

await page.screenshot({ path: "screenshots/before_search.png" });

console.log("Searching a room...");
await search_room(page);

await page.screenshot({ path: "screenshots/select.png" });

console.log("Looking up the availabilities...");
let availabilities = await list_availabilities(page);

let results = await find_best_interval(availabilities);
let start_time = results[0];
let max_length = results[1];
let max_elt = results[2];
await max_elt.click();
await page.waitForNavigation();

let str_hour = hours_to_formatted_string(start_time,max_length);

console.log(str_hour);
console.log("Making the reservation...");

await make_reservation(page,username2,username3,str_hour);

await page.screenshot({ path: "screenshots/select_hours.png" });

await page.waitForSelector(VALIDATE_BUTTON);
await page.click(VALIDATE_BUTTON);
await page.waitForNavigation();

await page.screenshot({ path: "screenshots/validation.png" });

console.log("Done");
await browser.close();
