#!/bin/bash
# Keeps trying to create the free ARM server until Oracle has capacity (ADR-014).
# Run it in Oracle Cloud Shell (console, top right ">_" icon), which is already signed in:
#   curl -fsSL https://raw.githubusercontent.com/jisisunil/creator-platform/main/infra/oracle/launch-retry.sh -o launch-retry.sh
#   bash launch-retry.sh
# Creates the network too (public subnet, internet gateway, ports 22/80/443) if it's missing.
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
# Prints the OCID of the first resource a list command finds, or nothing.
first_id() {
  local found
  found="$("$@" --query 'data[0].id' --raw-output 2> /dev/null || true)"
  if [ "$found" != 'null' ]; then echo "$found"; fi
}

# Makes the network the server needs, reusing whatever already exists: a VCN, an internet
# gateway with a default route to it, firewall rules for SSH/HTTP/HTTPS, and a public subnet.
create_public_subnet() {
  local vcn gateway route_table security_list
  vcn="$(first_id oci network vcn list --compartment-id "$compartment" --all)"
  if [ -z "$vcn" ]; then
    echo 'Creating the network (VCN)...' >&2
    vcn="$(oci network vcn create --compartment-id "$compartment" --display-name collabmigo-vcn \
      --cidr-blocks '["10.0.0.0/16"]' --dns-label collabmigo \
      --wait-for-state AVAILABLE --query 'data.id' --raw-output)"
  fi
  gateway="$(first_id oci network internet-gateway list --compartment-id "$compartment" --vcn-id "$vcn")"
  if [ -z "$gateway" ]; then
    echo 'Creating the internet gateway...' >&2
    gateway="$(oci network internet-gateway create --compartment-id "$compartment" --vcn-id "$vcn" \
      --display-name collabmigo-internet --is-enabled true \
      --wait-for-state AVAILABLE --query 'data.id' --raw-output)"
  fi
  route_table="$(oci network vcn get --vcn-id "$vcn" --query 'data."default-route-table-id"' --raw-output)"
  security_list="$(oci network vcn get --vcn-id "$vcn" --query 'data."default-security-list-id"' --raw-output)"
  echo 'Routing internet traffic through the gateway...' >&2
  oci network route-table update --rt-id "$route_table" --force > /dev/null \
    --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$gateway\"}]"
  echo 'Opening ports 22 (SSH), 80 and 443 (website)...' >&2
  oci network security-list update --security-list-id "$security_list" --force > /dev/null \
    --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all"}]' \
    --ingress-security-rules '[
      {"source":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
      {"source":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
      {"source":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"min":443,"max":443}}},
      {"source":"0.0.0.0/0","protocol":"1","icmpOptions":{"type":3,"code":4}},
      {"source":"10.0.0.0/16","protocol":"1","icmpOptions":{"type":3}}]'
  echo 'Creating the public subnet...' >&2
  oci network subnet create --compartment-id "$compartment" --vcn-id "$vcn" \
    --display-name collabmigo-public --cidr-block 10.0.0.0/24 --dns-label public \
    --prohibit-public-ip-on-vnic false \
    --wait-for-state AVAILABLE --query 'data.id' --raw-output
}

# A public subnet (one that gives servers public IP addresses): the subnet OCID given as the
# first argument, else the first public subnet found, else a newly created one.
subnet="${1:-}"
if [ -z "$subnet" ]; then
  # shellcheck disable=SC2016 # the backticks are a JMESPath literal for the OCI CLI, not shell
  subnet="$(oci network subnet list --compartment-id "$compartment" --all \
    --query 'data[?"prohibit-public-ip-on-vnic"==`false`].id | [0]' --raw-output 2> /dev/null || true)"
fi
case "$subnet" in
  ocid1.subnet.*) ;;
  *) subnet="$(create_public_subnet | tail -n 1)" ;;
esac
echo "Using subnet $subnet"

# The SSH key to log in with: kept in Cloud Shell; download the private key when done.
# RSA because Cloud Shell runs in FIPS mode, which refuses ed25519.
key="$HOME/.ssh/collabmigo"
if [ ! -f "$key" ]; then
  mkdir -p "$HOME/.ssh"
  ssh-keygen -t rsa -b 4096 -N '' -C collabmigo-pilot -f "$key" > /dev/null
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
