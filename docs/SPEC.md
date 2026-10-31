Tethys - Centralized system to control computers and turtles (CC:T Mod) and remote source controls
There will be a react-based web app for the dashboard

Features: 
    - mining turtles
    - music player
    - installer script

The computers and turtle will connect to an external server though HTTP or websocket.
The server itself should act more like a dispatcher and Computers and turtle will execute the task.

Installer script;  this will works by cloning (wget) a installer script from remote to turtle 
once the installer script ran (block until) the installer script will generate an ID for turtle/computer
a prompt will appear along with the ID of that turtle/computer on the console (server) operator (eg. player) need to select which role does that turtle will do.

user facing dashboard will be on /client/ (react ts) and server side codes will be in /server/ (python) and for computer and turtles /agents/

Remote source control, the computers/turtle will ping our server check for new version if there is new version the turtle will download it from github

music player, this will be a sync system that will publish the playlist to github release and computer/turtle need to stream that playlist (requires, storage on computer & turtle are limited)

mining turtle see more on /Users/lopax10/Desktop/cc-util another project that made with almost the same goal
but the codebase is really messy I don't want to look at it, and mining turtle is kinda sucks it fails almost all the time due to bad code and logic

we will expand this controlling system into many other stuff eg. automatic air ship control and cordination.

project structure, inside /agents/ there should be another folder for each task eg. agents/mining/ or agent/music/

if the server is offline all computer and turtle should just do nothing, on the control dashboard there should be an option to remove computer/turtle
