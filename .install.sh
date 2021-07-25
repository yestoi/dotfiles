#!/bin/sh

command -v brew
if [[ $? != 0 ]] ; then
    echo "Please install homebrew!"
else
    brew install neovim
    #curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim && echo "Vim plug installed"
    brew install zsh
    brew install tmux
    brew install fzf #et cetera for whatever else you want to install
fi
