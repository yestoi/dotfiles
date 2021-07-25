fpath+=$HOME/.zsh/pure

autoload -U promptinit; promptinit

zstyle ':prompt:pure:prompt:*' color cyan
zstyle :prompt:pure:git:stash show yes

prompt  pure
alias config='/usr/bin/git --git-dir=/Users/trey/.dotfiles/ --work-tree=/Users/trey'
