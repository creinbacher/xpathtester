<script lang="ts">
  import { onMount } from "svelte";

  let loading = true;
  let expression = "";
  let cnode = "";

  async function check(exp: string, context: string) {
    console.log("check called: " + exp);
    tsvscode.postMessage({
      type: "onCheck",
      value: { expression: exp, contextnode: context },
    });
  }

  onMount(() => {
    loading = false;
  });
</script>

{#if loading}
  <div>loading ...</div>
{:else}
  <form
    id="xpath"
    on:submit|preventDefault={async () => {
      console.log("form submitted");
      check(expression, cnode);
    }}
    on:reset={async () => {
      console.log("form resetted");
      expression = "";
      cnode = "";
    }}
  >
    <label for="expression">X-Path Expression:</label>
    <input
      id="expression"
      name="expression"
      type="text"
      bind:value={expression}
    />

    <label for="cnode">Context Node:</label>
    <input id="cnode" name="cnode" type="text" bind:value={cnode} />

    <button type="reset">Reset</button>
    <button type="submit">Check</button>
  </form>
{/if}
