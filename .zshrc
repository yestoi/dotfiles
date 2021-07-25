fpath+=$HOME/.zsh/pure

autoload -U promptinit; promptinit

zstyle ':prompt:pure:prompt:*' color green
zstyle :prompt:pure:git:stash show yes

prompt  pure
prompt_newline='%666v'
PROMPT=" $PROMPT"

source ./zsh/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

alias config='/usr/bin/git --git-dir=/Users/trey/.dotfiles/ --work-tree=/Users/trey'
