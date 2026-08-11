<div class="d-flex justify-content-between align-items-center mb-3">
  <h4 class="mb-0">__Name__ #<%= record.id %></h4>
  <div class="d-flex gap-2">
    <a href="/__kebab__/<%= record.id %>/edit" class="btn btn-sm btn-outline-secondary">Edit</a>
    <form method="POST" action="/__kebab__/<%= record.id %>" onsubmit="return confirm('Delete this __Name__?');">
      <input type="hidden" name="_csrf" value="<%= csrfToken %>">
      <input type="hidden" name="_method" value="DELETE">
      <button class="btn btn-sm btn-outline-danger">Delete</button>
    </form>
  </div>
</div>
<div class="card"><div class="card-body">
  <pre class="mb-0"><%= JSON.stringify(record, null, 2) %></pre>
</div></div>
