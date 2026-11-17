#!/bin/bash
# Keeps trying to create the free ARM server until Oracle has capacity (ADR-014).
# Run it in Oracle Cloud Shell (console, top right ">_" icon), which is already signed in:
#   curl -fsSL https://raw.githubusercontent.com/jisisunil/creator-platform/main/infra/oracle/launch-retry.sh -o launch-retry.sh
#   bash launch-retry.sh
# Tries 2 cores / 12 GB, then 1 core / 6 GB, every 2 minutes. Keep the Cloud Shell tab open
# (it closes after a long time without typing; just run it again). Stops at the first success.
set -euo pipefail

name='collabmigo-pilot'
shape='VM.Standard.A1.Flex'
wait_seconds=120
compartment="${OCI_TENANCY:?run this in Oracle Cloud Shell}"

# Don't create a second server if one already exists.
existing="$(oci compute instance list --compartment-id "$compartment" --display-name "$name" \
  --lifecycle-state RUNNING --query 'data[0].id' --raw-output 2> /dev/null || true)"
if [ -n "$existing" ] && [ "$existing" != 'null' ]; then
  echo "A running server named $name already exists: nothing to do."
  exit 0
fi

availability_domain="$(oci iam availability-domain list --compartment-id "$compartment" \
  --query 'data[0].name' --raw-output)"
image="$(oci compute image list --compartment-id "$compartment" \
  --operating-system 'Canonical Ubuntu' --operating-system-version '24.04' --shape "$shape" \
  --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output)"
# A public subnet: one that gives servers public IP addresses.
# shellcheck disable=SC2016 # the backticks are a JMESPath literal for the OCI CLI, not shell
subnet="$(oci network subnet list --compartment-id "$compartment" \
  --query 'data[?"prohibit-public-ip-on-vnic"==`false`].id | [0]' --raw-output)"
if [ -z "$subnet" ] || [ "$subnet" = 'null' ]; then
  echo 'No public subnet yet. In the console: Networking > Virtual cloud networks >'
  echo '"Start VCN Wizard" > "Create VCN with Internet Connectivity" > Create. Then run this again.'
  exit 1
fi

# The SSH key to log in with: kept in Cloud Shell; download the private key when done.
key="$HOME/.ssh/collabmigo"
if [ ! -f "$key" ]; then
  mkdir -p "$HOME/.ssh"
  ssh-keygen -t ed25519 -N '' -C collabmigo-pilot -f "$key" > /dev/null
  echo "Created an SSH key pair: $key (private) and $key.pub."
fi

echo "Region availability domain: $availability_domain"
echo "Trying to create $name every $wait_seconds seconds. Press Ctrl+C to stop."
attempt=0
while true; do
  attempt=$((attempt + 1))
  for size in '{"ocpus":2,"memoryInGBs":12}' '{"ocpus":1,"memoryInGBs":6}'; do
    if output="$(oci compute instance launch \
      --compartment-id "$compartment" --availability-domain "$availability_domain" \
      --display-name "$name" --shape "$shape" --shape-config "$size" \
      --image-id "$image" --subnet-id "$subnet" --assign-public-ip true \
      --boot-volume-size-in-gbs 100 --ssh-authorized-keys-file "$key.pub" \
      --wait-for-state RUNNING --query 'data.id' --raw-output 2>&1)"; then
      instance="$(echo "$output" | tail -n 1)"
      ip="$(oci compute instance list-vnics --instance-id "$instance" \
        --query 'data[0]."public-ip"' --raw-output)"
      echo
      echo "Created $name with $size. Public IP address: $ip"
      echo "Now download the private key: Cloud Shell menu (gear) > Download > .ssh/collabmigo"
      exit 0
    fi
    if ! echo "$output" | grep -qi 'capacity'; then
      echo "Oracle refused for another reason (not capacity):" >&2
      echo "$output" >&2
      exit 1
    fi
  done
  echo "$(date '+%H:%M') attempt $attempt: no capacity yet; trying again in $wait_seconds s."
  sleep "$wait_seconds"
done
