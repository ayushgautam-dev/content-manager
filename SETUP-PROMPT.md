# The setup prompt

Paste this into a fresh pod's chat in Lemma.

```
Set this pod up from https://github.com/ayushgautam-dev/content-manager: clone it
and run ./setup.sh, nothing else and nothing invented. It ends with a note
addressed to you; follow it.
```

`setup.sh` imports the pod with its files, checks every agent and function kept its
permissions, and ends with a note telling the agent what to say next.

Three things the note makes sure of:

- **The five questions are the person's.** Studio asks for their website and
  LinkedIn profile and what they want watched; setup then reads their site as
  them. An agent that answers for them sets up the wrong brand and sources.
- **No keys in chat.** Fetching past posts is optional and uses a key the person
  adds in Lemma (the pod's About page, Connectors), never pasted into a chat.
- **Nothing is posted.** The pod drafts; the person approves and posts.

The same repository also installs with one click, from the button in the
[README](README.md). That path runs only the import; Studio's first run then asks
the five questions.
