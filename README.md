# this project is about 67% vibe coded, I've made research and basic functions then asked AI to implement most logic. 

# What this project does: 
- Checks your calendar release based on Shoko server then tracks them on a nyaa.si website, sends info to use (What anime, episode, codec, size) then allows to download and handle it on Shoko.

<img width="445" height="667" alt="Screenshot From 2026-02-09 20-44-29" src="https://github.com/user-attachments/assets/40eb82bc-a204-4a27-bf42-e67357d6900a" />

# How it does it in practice: 
1. When program is first run, it will check both RSS and Search page for needed episode
2. Then it will set 2 schedules, RSS check every 30 min and final Search at 10PM. The final search is used in case RSS would miss a release
3. When it founds an anime release with requested title it will automagically check its episode, after it confirms its right it will scrape for more data then finally send a NTFY notificaiton
4. User will recieve that notif then will have a Download action button which in turn will send back request to server which will process it
5. At first it will add a new magnet to qbittorrent then track its progress, when file downloads it will send back notif to user
6. When file is downloaded it will wait for shoko to hash that file and once it does that, it will check has the file been imported (im doing this via ImportFolderID which will most likely different for you)
   
   6a. if the has changed ImportFolderID from original one it means Shoko has regonized that file and no more work is needed
8. It will wait a total of 2 minutes before attempting semi-manual linking, this linking works based on found File Id and requested Episode Id.
   


# Requirments: 
- Shoko
- qBittorrent
- NTFY

# Per platform requirments:
1. Shoko: besides two different folders for importing and destination you need to turn off "Rename on import" otherwise when asking for file ID with filename it will give back wrong files.
2. qBittorrent: WebUI
3. NTFY: pref custom owned and for sure one that requires user login.

# Contribution: 
feel free to make a PR however keep in mind this is vibe coded so if you find some funky code don't try asking me for explanation xd 

# Notes:
some of the stuff is hardcoded coz i just cbb, stuff like:
1. Mentioned before ImportFolderID
2. Blacklist for Groups, currently its: SubsPlease and New-raws, they don't include their codec so icbb
3. Currently in testing hard remove (2026) from anime title, this was made to handle titles like "Hime-sama "Goumon" no Jikan Desu (2026)" however i dont think it should be much of an issue in future. 

# why? 
I made this coz i couldn't find a good tool for this, i could use Sonarr or different arrs but getting one feature from a tool that does 10 of them seems wasteful, and with this i also have much more control what is actually downlading
