#!/bin/bash
# Stack before (top) and after (bottom) frames from tools/look/record.js into an MP4 (the owner's phone plays MP4, not GIF).
#   tools/look/video.sh <out.mp4> <frames dir> "<top label>" "<bottom label>" [<frames dir> "<top>" "<bottom>" ...]
# Several dirs are joined one after another.
set -e
out=$1; shift
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
tmp=$(mktemp -d); n=0
while [ $# -ge 3 ]; do
  d=$1; ta=$2; tb=$3; shift 3
  ffmpeg -y -loglevel error -framerate 15 -i "$d/a/%04d.png" -framerate 15 -i "$d/b/%04d.png" -filter_complex \
    "[0]scale=1280:-2,drawtext=fontfile=$F:text='$ta':x=24:y=h-60:fontsize=32:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10[a];[1]scale=1280:-2,drawtext=fontfile=$F:text='$tb':x=24:y=h-60:fontsize=32:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10[b];[a][b]vstack,fps=30" \
    -c:v libx264 -pix_fmt yuv420p -crf 20 "$tmp/$n.mp4"
  echo "file '$tmp/$n.mp4'" >> "$tmp/list.txt"; n=$((n+1))
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$tmp/list.txt" -c copy -movflags +faststart "$out"
rm -rf "$tmp"
